import { describe, it, expect } from "vitest";

import { computeQuoteTotals, lineNet } from "../lib/quotes-calc";

describe("lineNet", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineNet(2, 100)).toBe("200.00");
    expect(lineNet("3", "33.33")).toBe("99.99");
  });

  it("applies a percentage discount", () => {
    expect(lineNet(100, 10, 10)).toBe("900.00");
    expect(lineNet(1, 1000, "12.5")).toBe("875.00");
    expect(lineNet(2, 100, 0)).toBe("200.00");
    expect(lineNet(2, 100, 100)).toBe("0.00");
  });

  it("clamps out-of-range discounts", () => {
    expect(lineNet(1, 100, 150)).toBe("0.00");
    expect(lineNet(1, 100, -20)).toBe("100.00");
  });
});

describe("computeQuoteTotals", () => {
  it("computes a single 21% line", () => {
    const totals = computeQuoteTotals([
      { quantity: 2, unitPrice: 100, ivaRate: 21 },
    ]);
    expect(totals.net).toBe("200.00");
    expect(totals.ivaTotal).toBe("42.00");
    expect(totals.total).toBe("242.00");
    expect(totals.ivaBreakdown).toEqual([
      { rate: "21.00", base: "200.00", amount: "42.00" },
    ]);
  });

  it("discriminates IVA by rate", () => {
    const totals = computeQuoteTotals([
      { quantity: 1, unitPrice: 1000, ivaRate: 21 },
      { quantity: 1, unitPrice: 500, ivaRate: 10.5 },
    ]);
    expect(totals.net).toBe("1500.00");
    expect(totals.ivaTotal).toBe("262.50");
    expect(totals.total).toBe("1762.50");
    expect(totals.ivaBreakdown).toEqual([
      { rate: "10.50", base: "500.00", amount: "52.50" },
      { rate: "21.00", base: "1000.00", amount: "210.00" },
    ]);
  });

  it("groups multiple lines with the same rate", () => {
    const totals = computeQuoteTotals([
      { quantity: 2, unitPrice: 100, ivaRate: 21 },
      { quantity: 1, unitPrice: 300, ivaRate: 21 },
    ]);
    expect(totals.net).toBe("500.00");
    expect(totals.ivaBreakdown).toEqual([
      { rate: "21.00", base: "500.00", amount: "105.00" },
    ]);
    expect(totals.total).toBe("605.00");
  });

  it("handles a 0% (exempt) rate", () => {
    const totals = computeQuoteTotals([
      { quantity: 1, unitPrice: 1000, ivaRate: 0 },
    ]);
    expect(totals.ivaTotal).toBe("0.00");
    expect(totals.total).toBe("1000.00");
  });

  it("rounds correctly (no floating point drift)", () => {
    // 0.1 + 0.2 style trap plus IVA rounding.
    const totals = computeQuoteTotals([
      { quantity: 3, unitPrice: "33.33", ivaRate: 21 },
    ]);
    expect(totals.net).toBe("99.99");
    // 99.99 * 0.21 = 20.9979 -> 21.00
    expect(totals.ivaTotal).toBe("21.00");
    expect(totals.total).toBe("120.99");
  });

  it("applies discounts before computing IVA", () => {
    const totals = computeQuoteTotals([
      { quantity: 1, unitPrice: 1000, ivaRate: 21, discount: 10 },
    ]);
    // 1000 − 10% = 900 neto; IVA 21% de 900 = 189
    expect(totals.net).toBe("900.00");
    expect(totals.ivaTotal).toBe("189.00");
    expect(totals.total).toBe("1089.00");
  });

  it("returns zeros for an empty quote", () => {
    const totals = computeQuoteTotals([]);
    expect(totals.subtotal).toBe("0.00");
    expect(totals.overallDiscountAmount).toBe("0.00");
    expect(totals.net).toBe("0.00");
    expect(totals.ivaTotal).toBe("0.00");
    expect(totals.total).toBe("0.00");
    expect(totals.ivaBreakdown).toEqual([]);
  });

  it("without a general discount, subtotal equals net", () => {
    const totals = computeQuoteTotals([
      { quantity: 2, unitPrice: 100, ivaRate: 21 },
    ]);
    expect(totals.subtotal).toBe("200.00");
    expect(totals.overallDiscountPct).toBe("0.00");
    expect(totals.overallDiscountAmount).toBe("0.00");
    expect(totals.net).toBe("200.00");
  });
});

describe("computeQuoteTotals — descuento general", () => {
  it("applies the general discount before IVA", () => {
    // 1000 neto, 10% descuento general → 900 base; IVA 21% de 900 = 189
    const totals = computeQuoteTotals(
      [{ quantity: 1, unitPrice: 1000, ivaRate: 21 }],
      10
    );
    expect(totals.subtotal).toBe("1000.00");
    expect(totals.overallDiscountPct).toBe("10.00");
    expect(totals.overallDiscountAmount).toBe("100.00");
    expect(totals.net).toBe("900.00");
    expect(totals.ivaTotal).toBe("189.00");
    expect(totals.total).toBe("1089.00");
  });

  it("keeps IVA correct per rate after the general discount", () => {
    // Descuento general 10% sobre cada alícuota por separado.
    const totals = computeQuoteTotals(
      [
        { quantity: 1, unitPrice: 1000, ivaRate: 21 },
        { quantity: 1, unitPrice: 500, ivaRate: 10.5 },
      ],
      10
    );
    expect(totals.subtotal).toBe("1500.00");
    expect(totals.overallDiscountAmount).toBe("150.00");
    expect(totals.net).toBe("1350.00");
    // 900 @21% = 189 ; 450 @10.5% = 47.25
    expect(totals.ivaBreakdown).toEqual([
      { rate: "10.50", base: "450.00", amount: "47.25" },
      { rate: "21.00", base: "900.00", amount: "189.00" },
    ]);
    expect(totals.ivaTotal).toBe("236.25");
    expect(totals.total).toBe("1586.25");
  });

  it("stacks on top of per-item discounts", () => {
    // Ítem: 1000 − 20% = 800 ; descuento general 10% → 720
    const totals = computeQuoteTotals(
      [{ quantity: 1, unitPrice: 1000, ivaRate: 21, discount: 20 }],
      10
    );
    expect(totals.subtotal).toBe("800.00");
    expect(totals.net).toBe("720.00");
    expect(totals.total).toBe("871.20"); // 720 + 21% (151.20)
  });

  it("clamps an out-of-range general discount", () => {
    const totals = computeQuoteTotals(
      [{ quantity: 1, unitPrice: 100, ivaRate: 21 }],
      150
    );
    expect(totals.net).toBe("0.00");
    expect(totals.total).toBe("0.00");
  });
});

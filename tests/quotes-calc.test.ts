import { describe, it, expect } from "vitest";

import { computeQuoteTotals, lineNet } from "../lib/quotes-calc";

describe("lineNet", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineNet(2, 100)).toBe("200.00");
    expect(lineNet("3", "33.33")).toBe("99.99");
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

  it("returns zeros for an empty quote", () => {
    const totals = computeQuoteTotals([]);
    expect(totals.net).toBe("0.00");
    expect(totals.ivaTotal).toBe("0.00");
    expect(totals.total).toBe("0.00");
    expect(totals.ivaBreakdown).toEqual([]);
  });
});

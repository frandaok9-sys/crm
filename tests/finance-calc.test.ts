import { describe, it, expect } from "vitest";

import { computeBreakEven, computeMonthFinance } from "../lib/finance-calc";

describe("computeBreakEven (punto de equilibrio)", () => {
  it("caso normal: fijos 1000, variables 400, ingresos 1000 → 1666.67", () => {
    // margen = 1 − 400/1000 = 0.6 → 1000 / 0.6 = 1666.666… → 1666.67
    expect(computeBreakEven(1000, 400, 1000).value).toBe("1666.67");
  });

  it("sin costos variables: equilibrio = costos fijos", () => {
    expect(computeBreakEven("2500.00", 0, "10000.00").value).toBe("2500.00");
  });

  it("sin costos fijos: equilibrio 0 (cada peso deja margen)", () => {
    expect(computeBreakEven(0, 400, 1000).value).toBe("0.00");
  });

  it("sin ingresos: no se puede estimar (null con nota)", () => {
    const r = computeBreakEven(1000, 0, 0);
    expect(r.value).toBeNull();
    expect(r.note).toMatch(/Sin ingresos/);
  });

  it("variables ≥ ingresos: no hay margen (null con nota)", () => {
    expect(computeBreakEven(1000, 1000, 1000).value).toBeNull();
    expect(computeBreakEven(1000, 1500, 1000).value).toBeNull();
  });

  it("precisión decimal: sin errores de flotante", () => {
    // margen = 1 − 0.1/0.3 = 2/3 → 100 / (2/3) = 150
    expect(computeBreakEven("100", "0.10", "0.30").value).toBe("150.00");
  });
});

describe("computeMonthFinance (balance del mes)", () => {
  it("mes ganador: resultado positivo", () => {
    const m = computeMonthFinance({
      income: "5000000.00",
      fixedCosts: "1200000.00",
      variableCosts: "1800000.00",
    });
    expect(m.totalCosts).toBe("3000000.00");
    expect(m.result).toBe("2000000.00");
    // margen = 1 − 1.8M/5M = 0.64 → 1.2M / 0.64 = 1875000
    expect(m.breakEven).toBe("1875000.00");
  });

  it("mes perdedor: resultado negativo pero con equilibrio alcanzable", () => {
    const m = computeMonthFinance({
      income: "1000",
      fixedCosts: "800",
      variableCosts: "400",
    });
    expect(m.result).toBe("-200.00");
    // margen = 1 − 400/1000 = 0.6 → 800 / 0.6 = 1333.33: facturando eso, empata.
    expect(m.breakEven).toBe("1333.33");
  });

  it("mes sin actividad: todo en cero, sin equilibrio", () => {
    const m = computeMonthFinance({ income: 0, fixedCosts: 0, variableCosts: 0 });
    expect(m.result).toBe("0.00");
    expect(m.breakEven).toBeNull();
  });
});

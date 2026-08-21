import { describe, it, expect } from "vitest";

import { buildExpenseBreakdown, parseArMoney } from "@/lib/expense-calc";

describe("parseArMoney", () => {
  it("entiende el formato argentino y el plano", () => {
    expect(parseArMoney("1.250.000,50")).toBe("1250000.50");
    expect(parseArMoney("1500,5")).toBe("1500.50");
    expect(parseArMoney("1500.50")).toBe("1500.50");
    expect(parseArMoney("1.500")).toBe("1500.00"); // miles, no 1,50
    expect(parseArMoney("$ 25000")).toBe("25000.00");
  });
  it("rechaza lo que no es número", () => {
    expect(parseArMoney("abc")).toBeNull();
    expect(parseArMoney("")).toBeNull();
    expect(parseArMoney(null)).toBeNull();
  });
});

describe("buildExpenseBreakdown", () => {
  it("total = neto + impuestos, en Decimal (sin errores de coma flotante)", () => {
    const b = buildExpenseBreakdown({
      netAmount: "100.000,00",
      taxes: [
        { label: "IVA 21%", amount: "21.000,00" },
        { label: "Percepción IIBB", amount: "3.500,00" },
      ],
    });
    expect(b.netAmount).toBe("100000.00");
    expect(b.total).toBe("124500.00");
    expect(b.taxes).toEqual([
      { label: "IVA 21%", amount: "21000.00" },
      { label: "Percepción IIBB", amount: "3500.00" },
    ]);
  });
  it("sin impuestos: el total es el neto (gasto sin desglose)", () => {
    const b = buildExpenseBreakdown({ netAmount: "0,1", taxes: [] });
    expect(b.total).toBe("0.10");
    // 0.1 + 0.2 en float daría 0.30000000000000004: acá es Decimal.
    const c = buildExpenseBreakdown({
      netAmount: "0,1",
      taxes: [{ label: "x", amount: "0,2" }],
    });
    expect(c.total).toBe("0.30");
  });
  it("ignora filas vacías y las de importe cero", () => {
    const b = buildExpenseBreakdown({
      netAmount: "1000",
      taxes: [
        { label: "", amount: "" },
        { label: "IVA 21%", amount: "0" },
        { label: "Impuestos internos", amount: "50" },
      ],
    });
    expect(b.taxes).toEqual([{ label: "Impuestos internos", amount: "50.00" }]);
    expect(b.total).toBe("1050.00");
  });
  it("exige neto mayor a cero y etiqueta en cada impuesto con importe", () => {
    expect(() => buildExpenseBreakdown({ netAmount: "", taxes: [] })).toThrow(/neto/);
    expect(() => buildExpenseBreakdown({ netAmount: "0", taxes: [] })).toThrow(/mayor a cero/);
    expect(() =>
      buildExpenseBreakdown({ netAmount: "100", taxes: [{ label: "", amount: "21" }] })
    ).toThrow(/nombre/);
    expect(() =>
      buildExpenseBreakdown({ netAmount: "100", taxes: [{ label: "IVA", amount: "-1" }] })
    ).toThrow(/negativo|no es un número/);
  });
});

import { describe, it, expect } from "vitest";

import { formatInvoiceNumber, cleanInvoiceNumber } from "../lib/invoices";
import { CBTE_TIPO } from "../lib/afip";

describe("número de comprobante", () => {
  it("arma el número fiscal de ARCA con punto de venta y letra", () => {
    expect(
      formatInvoiceNumber({
        cbteTipo: CBTE_TIPO.FACTURA_A,
        ptoVta: 3,
        cbteNro: 1234,
      })
    ).toBe("FC A 0003-00001234");
    expect(
      formatInvoiceNumber({
        cbteTipo: CBTE_TIPO.FACTURA_B,
        ptoVta: 12,
        cbteNro: 7,
      })
    ).toBe("FC B 0012-00000007");
  });

  it("los datos fiscales le ganan al número escrito a mano", () => {
    expect(
      formatInvoiceNumber({
        reference: "PRE-0005",
        cbteTipo: CBTE_TIPO.FACTURA_A,
        ptoVta: 3,
        cbteNro: 9,
      })
    ).toBe("FC A 0003-00000009");
  });

  it("usa el número cargado a mano mientras no haya ARCA", () => {
    expect(formatInvoiceNumber({ reference: "0003-00001234" })).toBe(
      "FC 0003-00001234"
    );
    // Si ya trae prefijo, no lo duplica.
    expect(formatInvoiceNumber({ reference: "FC A 0003-00001234" })).toBe(
      "FC A 0003-00001234"
    );
    expect(formatInvoiceNumber({ reference: "Factura 123" })).toBe(
      "Factura 123"
    );
  });

  it("sin número devuelve null (se muestra solo 'Facturado')", () => {
    expect(formatInvoiceNumber({})).toBeNull();
    expect(formatInvoiceNumber({ reference: "   " })).toBeNull();
  });

  it("no inventa un comprobante con el código del presupuesto", () => {
    // Al facturar sin cargar el número, la referencia queda con el código
    // del presupuesto: eso NO es una factura ("FC PRE-0005 Rev.4").
    expect(formatInvoiceNumber({ reference: "PRE-0005" }, "PRE-0005")).toBeNull();
    expect(
      formatInvoiceNumber({ reference: "PRE-0005 Rev.4" }, "PRE-0005")
    ).toBeNull();
    // Un número real sí se muestra, aunque se pase el código.
    expect(formatInvoiceNumber({ reference: "0003-00001234" }, "PRE-0005")).toBe(
      "FC 0003-00001234"
    );
  });

  it("limpia lo que escribe la persona sin inventar nada", () => {
    expect(cleanInvoiceNumber("  0003-00001234  ")).toBe("0003-00001234");
    expect(cleanInvoiceNumber("A   0003-00001234")).toBe("A 0003-00001234");
    expect(cleanInvoiceNumber("")).toBeNull();
    expect(cleanInvoiceNumber(null)).toBeNull();
  });
});

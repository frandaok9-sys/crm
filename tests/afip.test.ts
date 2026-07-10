import { describe, it, expect } from "vitest";

import {
  CBTE_TIPO,
  facturaTipoParaCliente,
  condicionIvaReceptor,
  ivaAlicId,
  validarComprobante,
} from "../lib/afip";
import { IvaCondition } from "../lib/generated/prisma/enums";

describe("AFIP — tipo de factura según el cliente", () => {
  it("Factura A a un Responsable Inscripto", () => {
    expect(facturaTipoParaCliente(IvaCondition.RESPONSABLE_INSCRIPTO)).toBe(
      CBTE_TIPO.FACTURA_A
    );
  });

  it("Factura B a monotributo, exento, consumidor final, no alcanzado y sin dato", () => {
    for (const iva of [
      IvaCondition.MONOTRIBUTO,
      IvaCondition.EXENTO,
      IvaCondition.CONSUMIDOR_FINAL,
      IvaCondition.NO_ALCANZADO,
      null,
    ]) {
      expect(facturaTipoParaCliente(iva)).toBe(CBTE_TIPO.FACTURA_B);
    }
  });
});

describe("AFIP — condición de IVA del receptor (RG 5616)", () => {
  it("mapea cada condición a su código AFIP", () => {
    expect(condicionIvaReceptor(IvaCondition.RESPONSABLE_INSCRIPTO)).toBe(1);
    expect(condicionIvaReceptor(IvaCondition.EXENTO)).toBe(4);
    expect(condicionIvaReceptor(IvaCondition.CONSUMIDOR_FINAL)).toBe(5);
    expect(condicionIvaReceptor(IvaCondition.MONOTRIBUTO)).toBe(6);
    expect(condicionIvaReceptor(IvaCondition.NO_ALCANZADO)).toBe(15);
    expect(condicionIvaReceptor(null)).toBe(5); // por defecto consumidor final
  });
});

describe("AFIP — id de alícuota de IVA", () => {
  it("traduce el porcentaje al id de AFIP", () => {
    expect(ivaAlicId(21)).toBe(5);
    expect(ivaAlicId("10.5")).toBe(4);
    expect(ivaAlicId(27)).toBe(6);
    expect(ivaAlicId(0)).toBe(3);
    expect(ivaAlicId(99)).toBe(5); // desconocido → 21%
  });
});

describe("AFIP — validación de comprobante", () => {
  it("bloquea Factura A sin CUIT del cliente", () => {
    const motivo = validarComprobante({
      ivaCondition: IvaCondition.RESPONSABLE_INSCRIPTO,
      taxId: null,
    });
    expect(motivo).toMatch(/CUIT/i);
  });

  it("permite Factura A con CUIT", () => {
    expect(
      validarComprobante({
        ivaCondition: IvaCondition.RESPONSABLE_INSCRIPTO,
        taxId: "30-12345678-9",
      })
    ).toBeNull();
  });

  it("permite Factura B sin CUIT (consumidor final)", () => {
    expect(
      validarComprobante({
        ivaCondition: IvaCondition.CONSUMIDOR_FINAL,
        taxId: null,
      })
    ).toBeNull();
  });
});

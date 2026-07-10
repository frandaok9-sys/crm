import { IvaCondition } from "@/lib/generated/prisma/enums";

/**
 * Reglas fiscales AFIP para facturación electrónica (RC Pisos = Responsable
 * Inscripto). Acá vive SOLO la lógica pura (qué comprobante corresponde, qué
 * códigos AFIP usar); la conexión al web service va aparte (lib/afip-client).
 */

/** Códigos de tipo de comprobante de AFIP (WSFEv1). */
export const CBTE_TIPO = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
} as const;

export const CBTE_TIPO_LABELS: Record<number, string> = {
  1: "Factura A",
  2: "Nota de Débito A",
  3: "Nota de Crédito A",
  6: "Factura B",
  7: "Nota de Débito B",
  8: "Nota de Crédito B",
};

/**
 * Tipo de FACTURA que un Responsable Inscripto emite a un cliente según su
 * condición de IVA: Factura A si el cliente también es RI; Factura B para
 * todos los demás (monotributo, exento, consumidor final, no alcanzado).
 */
export function facturaTipoParaCliente(
  clientIva: IvaCondition | null | undefined
): number {
  return clientIva === IvaCondition.RESPONSABLE_INSCRIPTO
    ? CBTE_TIPO.FACTURA_A
    : CBTE_TIPO.FACTURA_B;
}

/**
 * Código "Condición frente al IVA del receptor" que AFIP exige en cada
 * comprobante desde la RG 5616/2024.
 * (1=RI, 4=Exento, 5=Consumidor Final, 6=Monotributo, 15=No alcanzado)
 */
export function condicionIvaReceptor(
  clientIva: IvaCondition | null | undefined
): number {
  switch (clientIva) {
    case IvaCondition.RESPONSABLE_INSCRIPTO:
      return 1;
    case IvaCondition.EXENTO:
      return 4;
    case IvaCondition.MONOTRIBUTO:
      return 6;
    case IvaCondition.NO_ALCANZADO:
      return 15;
    case IvaCondition.CONSUMIDOR_FINAL:
    default:
      return 5;
  }
}

/** Id de alícuota de IVA de AFIP según el porcentaje. */
export const IVA_ALIC_ID: Record<string, number> = {
  "0": 3, // 0%
  "10.5": 4,
  "21": 5,
  "27": 6,
  "5": 8,
  "2.5": 9,
};

export function ivaAlicId(ratePct: string | number): number {
  const key = String(Number(ratePct));
  return IVA_ALIC_ID[key] ?? 5; // por defecto 21%
}

/**
 * Una Factura A requiere que el cliente tenga CUIT (es a otro inscripto).
 * Devuelve el motivo si NO se puede emitir, o null si está todo OK.
 */
export function validarComprobante(cliente: {
  ivaCondition: IvaCondition | null;
  taxId: string | null;
}): string | null {
  const tipo = facturaTipoParaCliente(cliente.ivaCondition);
  if (tipo === CBTE_TIPO.FACTURA_A && !cliente.taxId?.trim()) {
    return "Para emitir Factura A el cliente (Responsable Inscripto) necesita CUIT cargado.";
  }
  return null;
}

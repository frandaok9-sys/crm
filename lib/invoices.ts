import { CBTE_TIPO_LABELS } from "@/lib/afip";

/**
 * Número de comprobante de una factura, con UNA sola forma de armarlo para
 * todo el sistema (lista de presupuestos, detalle, cuenta corriente y, más
 * adelante, el PDF fiscal).
 *
 * "Facturado" NO es un estado del presupuesto: es un hecho contable —
 * existe un LedgerMovement de tipo INVOICE vinculado. El estado comercial
 * (Borrador→Enviado→Aprobado…) sigue intacto.
 *
 * Prioridad del número:
 *   1. Datos fiscales de ARCA (punto de venta + número): "FC A 0003-00001234"
 *   2. El número que cargó quien facturó ("reference")
 *   3. Nada → null (se muestra solo el cartel "Facturado")
 */
export type InvoiceRef = {
  reference?: string | null;
  cbteTipo?: number | null;
  ptoVta?: number | null;
  cbteNro?: number | null;
};

/** Letra del comprobante ("A", "B"…) a partir del código AFIP. */
function letra(cbteTipo?: number | null): string {
  if (!cbteTipo) return "";
  const label = CBTE_TIPO_LABELS[cbteTipo] ?? "";
  const last = label.trim().slice(-1);
  return /[A-Z]/.test(last) ? ` ${last}` : "";
}

/**
 * `quoteCode`: código del presupuesto (PRE-0005). Si la referencia guardada
 * es ese mismo código, NO es un número de factura — es el eco del
 * presupuesto que se usa como referencia cuando se facturó sin cargar el
 * comprobante. En ese caso devuelve null: mejor mostrar solo "Facturado"
 * que inventar un "FC PRE-0005".
 */
export function formatInvoiceNumber(
  inv: InvoiceRef,
  quoteCode?: string | null
): string | null {
  if (inv.ptoVta && inv.cbteNro) {
    const pv = String(inv.ptoVta).padStart(4, "0");
    const nro = String(inv.cbteNro).padStart(8, "0");
    return `FC${letra(inv.cbteTipo)} ${pv}-${nro}`;
  }
  const manual = inv.reference?.trim();
  if (!manual) return null;
  if (quoteCode && manual.toUpperCase().startsWith(quoteCode.toUpperCase())) {
    return null; // es el código del presupuesto, no un comprobante
  }
  // Si ya viene con prefijo (FC, FA, Factura…), se respeta tal cual.
  return /^(fc|fa|factura)\b/i.test(manual) ? manual : `FC ${manual}`;
}

/**
 * Normaliza lo que escribe una persona al facturar: "0003-00001234",
 * "3-1234", "A 0003-00001234". Solo limpia espacios de más; NO inventa
 * ceros ni letras (el número lo pone el comprobante real).
 */
export function cleanInvoiceNumber(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  return s ? s.slice(0, 40) : null;
}

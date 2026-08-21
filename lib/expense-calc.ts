import Decimal from "decimal.js";

/**
 * Desglose de un gasto (M5): importe NETO + agregados/impuestos = TOTAL de la
 * factura. Lógica pura (sin base de datos) para poder testearla: todo en
 * Decimal, nunca float. Los impuestos se guardan línea por línea con su
 * etiqueta (IVA 21%, percepción IIBB, impuestos internos…) para que
 * Administración pueda liquidar después con esos datos.
 */

export type ExpenseTaxLine = { label: string; amount: string };

export type ExpenseBreakdown = {
  netAmount: string; // 2 decimales
  taxes: ExpenseTaxLine[]; // solo líneas con importe > 0
  total: string; // neto + Σ impuestos, 2 decimales
};

/** Etiquetas sugeridas (el usuario puede escribir otra). */
export const TAX_LABEL_SUGGESTIONS = [
  "IVA 21%",
  "IVA 10,5%",
  "IVA 27%",
  "Percepción IVA",
  "Percepción IIBB",
  "Retención IIBB",
  "Impuestos internos",
  "Otro agregado",
] as const;

/**
 * Importe escrito "a la argentina" ("1.250.000,50"), con coma decimal
 * ("1500,5") o plano ("1500.50") → string decimal de 2 posiciones.
 * Devuelve null si no es un número válido.
 */
export function parseArMoney(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[$\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Solo puntos en grupos de miles ("1.500" = mil quinientos, no 1,50).
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return new Decimal(s).toDecimalPlaces(2).toFixed(2);
}

/**
 * Arma el desglose validado. Reglas:
 * - El neto es obligatorio y > 0.
 * - Cada impuesto con importe > 0 necesita una etiqueta; las líneas vacías
 *   (sin importe) se descartan en silencio (filas del formulario sin usar).
 * - Un impuesto negativo o no numérico es error (no se adivina).
 * - total = neto + Σ impuestos (Decimal, 2 posiciones).
 */
export function buildExpenseBreakdown(input: {
  netAmount: string | null | undefined;
  taxes: { label: string | null | undefined; amount: string | null | undefined }[];
}): ExpenseBreakdown {
  const net = parseArMoney(input.netAmount);
  if (net == null) throw new Error("El importe neto es obligatorio y debe ser un número.");
  if (new Decimal(net).lte(0)) throw new Error("El importe neto debe ser mayor a cero.");

  const taxes: ExpenseTaxLine[] = [];
  let taxSum = new Decimal(0);
  for (const line of input.taxes) {
    const rawAmount = (line.amount ?? "").toString().trim();
    const label = (line.label ?? "").toString().trim();
    if (!rawAmount && !label) continue; // fila sin usar
    if (!rawAmount) continue; // etiqueta sin importe: se ignora
    const amount = parseArMoney(rawAmount);
    if (amount == null) {
      throw new Error(`El importe de "${label || "impuesto"}" no es un número válido.`);
    }
    const dec = new Decimal(amount);
    if (dec.lt(0)) throw new Error("Un impuesto no puede ser negativo.");
    if (dec.eq(0)) continue;
    if (!label) throw new Error("Cada impuesto o agregado necesita un nombre (ej: IVA 21%).");
    taxes.push({ label: label.slice(0, 60), amount });
    taxSum = taxSum.plus(dec);
  }

  return {
    netAmount: net,
    taxes,
    total: new Decimal(net).plus(taxSum).toFixed(2),
  };
}

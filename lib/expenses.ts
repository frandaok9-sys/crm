import { CostKind, FiscalKind } from "@/lib/generated/prisma/enums";

/** Etiquetas en español para la UI del módulo de gastos (M1+M2+M3). */

export const COST_KIND_LABELS: Record<CostKind, string> = {
  [CostKind.FIXED]: "Fijo",
  [CostKind.VARIABLE]: "Variable",
};

export const FISCAL_KIND_LABELS: Record<FiscalKind, string> = {
  [FiscalKind.INVOICED]: "Facturado",
  [FiscalKind.INTERNAL]: "Sin factura",
};

export const PAYMENT_METHODS = [
  "Efectivo",
  "Transferencia",
  "Tarjeta",
  "Cheque",
  "Mercado Pago",
] as const;

/** "2026-07" → rango [1 jul 00:00, 1 ago 00:00) en hora argentina (-03). */
export function monthRange(month: string): { gte: Date; lt: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  const gte = new Date(`${month}-01T00:00:00-03:00`);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const lt = new Date(`${next}-01T00:00:00-03:00`);
  return { gte, lt };
}

/** Mes actual en hora argentina, formato "AAAA-MM". */
export function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

/** "2026-07" → "julio 2026" (para títulos). */
export function monthLabel(month: string): string {
  const range = monthRange(month);
  if (!range) return month;
  // Mediodía del día 2 para esquivar cualquier corrimiento de zona horaria.
  const mid = new Date(`${month}-02T12:00:00-03:00`);
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(mid);
}

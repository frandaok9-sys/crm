import { QuoteStatus, QuoteItemType } from "@/lib/generated/prisma/enums";

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]: "Borrador",
  [QuoteStatus.SENT]: "Enviado",
  [QuoteStatus.APPROVED]: "Aprobado",
  [QuoteStatus.REJECTED]: "Rechazado",
  [QuoteStatus.EXPIRED]: "Vencido",
};

export const QUOTE_STATUS_STYLES: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]:
    "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  [QuoteStatus.SENT]:
    "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  [QuoteStatus.APPROVED]:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  [QuoteStatus.REJECTED]:
    "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  [QuoteStatus.EXPIRED]:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export const ITEM_TYPE_LABELS: Record<QuoteItemType, string> = {
  [QuoteItemType.PRODUCT]: "Producto",
  [QuoteItemType.SERVICE]: "Servicio",
  [QuoteItemType.TEXT]: "Texto libre",
};

/** Un presupuesto puede tener varias revisiones (rootId agrupa Rev.1, Rev.2…). Nos quedamos con la más nueva de cada grupo. */
export function latestRevisions<
  T extends { id: string; rootId: string | null; version: number },
>(quotes: T[]): T[] {
  const latestByGroup = new Map<string, T>();
  for (const quote of quotes) {
    const group = quote.rootId ?? quote.id;
    const current = latestByGroup.get(group);
    if (!current || quote.version > current.version) {
      latestByGroup.set(group, quote);
    }
  }
  return [...latestByGroup.values()];
}

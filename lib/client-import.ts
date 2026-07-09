import { IvaCondition } from "@/lib/generated/prisma/enums";
import { IVA_LABELS } from "@/lib/clients";

/** Result state for the Excel import action (used with useActionState). */
export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; created: number; skipped: number; invalid: number };

/** Columns of the import template, in order. `field` maps to a Client field. */
export const IMPORT_COLUMNS = [
  { header: "Razón social", field: "legalName", required: true },
  { header: "Nombre de fantasía", field: "tradeName" },
  { header: "CUIT", field: "taxId" },
  { header: "Condición IVA", field: "ivaCondition" },
  { header: "Email", field: "email" },
  { header: "Teléfono", field: "phone" },
  { header: "Dirección", field: "address" },
  { header: "Localidad", field: "city" },
  { header: "Provincia", field: "province" },
  { header: "Rubro", field: "industry" },
  { header: "Notas", field: "notes" },
] as const;

/** Lowercase, strip accents, collapse whitespace — for tolerant matching. */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Normalized header text -> Client field name (with a few synonyms). */
export const HEADER_TO_FIELD: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const column of IMPORT_COLUMNS) {
    map[normalizeHeader(column.header)] = column.field;
  }
  map["fantasia"] = "tradeName";
  map["nombre fantasia"] = "tradeName";
  map["iva"] = "ivaCondition";
  map["correo"] = "email";
  map["mail"] = "email";
  map["tel"] = "phone";
  map["telefono/celular"] = "phone";
  map["celular"] = "phone";
  map["ciudad"] = "city";
  map["observaciones"] = "notes";
  return map;
})();

const IVA_BY_TEXT: Record<string, IvaCondition> = (() => {
  const map: Record<string, IvaCondition> = {};
  for (const iva of Object.values(IvaCondition)) {
    map[normalizeHeader(IVA_LABELS[iva])] = iva;
    map[normalizeHeader(iva)] = iva;
  }
  map["ri"] = IvaCondition.RESPONSABLE_INSCRIPTO;
  map["responsable"] = IvaCondition.RESPONSABLE_INSCRIPTO;
  map["mono"] = IvaCondition.MONOTRIBUTO;
  map["cf"] = IvaCondition.CONSUMIDOR_FINAL;
  return map;
})();

/** Maps a free-text IVA condition from Excel to the enum, or null. */
export function mapIvaCondition(value: string | null): IvaCondition | null {
  if (!value) return null;
  return IVA_BY_TEXT[normalizeHeader(value)] ?? null;
}

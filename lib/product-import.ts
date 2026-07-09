/** Result state for the product Excel import (used with useActionState). */
export type ProductImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; created: number; skipped: number; invalid: number };

/** Columns of the product import template, in order. */
export const PRODUCT_IMPORT_COLUMNS = [
  { header: "Producto", field: "name", required: true },
  { header: "Marca", field: "brand" },
  { header: "Código", field: "sku" },
  { header: "Descripción", field: "description" },
  { header: "Unidad", field: "unit" },
  { header: "Precio (sin IVA)", field: "price" },
  { header: "Moneda", field: "currency" },
  { header: "IVA %", field: "ivaRate" },
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

/** Normalized header text -> Product field name (with synonyms). */
export const PRODUCT_HEADER_TO_FIELD: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const column of PRODUCT_IMPORT_COLUMNS) {
    map[normalizeHeader(column.header)] = column.field;
  }
  map["nombre"] = "name";
  map["articulo"] = "name";
  map["detalle"] = "description";
  map["proveedor"] = "brand";
  map["cod"] = "sku";
  map["codigo"] = "sku";
  map["sku"] = "sku";
  map["precio"] = "price";
  map["precio neto"] = "price";
  map["precio unitario"] = "price";
  map["iva"] = "ivaRate";
  map["alicuota"] = "ivaRate";
  map["um"] = "unit";
  map["presentacion"] = "unit";
  return map;
})();

/**
 * NEXUS — El cerebro: modelo canónico de la central.
 *
 * La regla madre (guía Nexus §1): se integran DATOS, no sistemas. La central
 * define UNA forma estándar para cada entidad y todo lo que entra se traduce a
 * esa forma. Cada registro lleva SIEMPRE dos identificadores: el nexus_id
 * (nuestro `id`, inmutable) y el external_id (su id en el sistema de origen).
 *
 * Este archivo es PURO (sin Prisma): define las entidades canónicas, la
 * identidad, la matriz de dueño del dato y el validador de importación. La
 * escritura en la central (SyncLog, tenants) vive en lib/nexus/central.ts.
 */

// ---------------------------------------------------------------------------
// Entidades canónicas (guía §1)
// ---------------------------------------------------------------------------

export type CanonicalEntity =
  | "tenant"
  | "client"
  | "opportunity"
  | "quote"
  | "activity";

export const CANONICAL_ENTITIES: Record<
  CanonicalEntity,
  { label: string; identity: string; append_only?: boolean }
> = {
  tenant: { label: "Empresa", identity: "CUIT (único)" },
  client: {
    label: "Cliente final",
    identity: "CUIT; si no hay, nombre normalizado + zona",
  },
  opportunity: { label: "Oportunidad", identity: "nexus_id ↔ external_id" },
  quote: { label: "Cotización", identity: "nexus_id ↔ external_id" },
  activity: {
    label: "Actividad",
    identity: "solo se agrega (historial inmutable)",
    append_only: true,
  },
};

/**
 * Matriz de dueño del dato (guía §3.4): quién manda ante conflicto por entidad.
 * "external" = manda el sistema del cliente; "central" = manda Nexus.
 */
export const DATA_OWNER: Record<CanonicalEntity, "external" | "central" | "contract"> = {
  tenant: "central",
  client: "external", // la cartera y sus datos las manda el sistema del cliente
  opportunity: "central", // las oportunidades creadas por Nexus las manda la central
  quote: "central", // el estado manda del lado del dueño del dato (Nexus por defecto)
  activity: "central", // historial append-only, nunca hay conflicto
};

/** Referencia canónica de cualquier registro: el par (nexus_id, external_id). */
export function nexusRef(entity: {
  id: string;
  externalId?: string | null;
}): { nexusId: string; externalId: string | null } {
  return { nexusId: entity.id, externalId: entity.externalId ?? null };
}

// ---------------------------------------------------------------------------
// Identidad y normalización
// ---------------------------------------------------------------------------

/** Deja solo dígitos y valida el CUIT argentino (11 dígitos + verificador mod 11). */
export function normalizeCuit(raw: string | null | undefined): {
  value: string | null;
  valid: boolean;
} {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return { value: digits || null, valid: false };
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * weights[i];
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return { value: digits, valid: check === Number(digits[10]) };
}

/** Normaliza un nombre para comparaciones de identidad (sin acentos, minúsculas, sin ruido). */
export function normalizeName(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|sas|s\.?a\.?s\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Clave de identidad de un cliente final (guía §1): el CUIT si existe; si no,
 * nombre normalizado + zona. Es lo que evita duplicar el mismo cliente.
 */
export function clientIdentityKey(client: {
  cuit?: string | null;
  name?: string | null;
  zone?: string | null;
}): string {
  const { value, valid } = normalizeCuit(client.cuit);
  if (valid && value) return `cuit:${value}`;
  const name = normalizeName(client.name);
  const zone = normalizeName(client.zone);
  return `name:${name}|zone:${zone}`;
}

// ---------------------------------------------------------------------------
// Validador de importación (guía §4: onboarding Vía A)
// ---------------------------------------------------------------------------

export type ImportEntity = "clientes" | "productos" | "oportunidades";

const REQUIRED_COLUMNS: Record<ImportEntity, string[]> = {
  clientes: ["razon_social"],
  productos: ["nombre", "precio"],
  oportunidades: ["cliente", "titulo"],
};

export type RowError = { column: string; message: string };

/**
 * Valida una fila de importación contra las reglas canónicas. Devuelve la lista
 * de errores (vacía = fila válida). El validador rechaza filas con errores y
 * devuelve el detalle — nunca se corrige a mano (guía §4, Día 1).
 */
export function validateImportRow(
  entity: ImportEntity,
  row: Record<string, unknown>
): RowError[] {
  const errors: RowError[] = [];
  const get = (k: string) => String(row[k] ?? "").trim();

  for (const col of REQUIRED_COLUMNS[entity]) {
    if (!get(col)) errors.push({ column: col, message: "Columna obligatoria vacía" });
  }

  // CUIT: opcional, pero si viene tiene que ser válido.
  if ("cuit" in row && get("cuit")) {
    const { valid } = normalizeCuit(get("cuit"));
    if (!valid) errors.push({ column: "cuit", message: "CUIT inválido" });
  }

  // Moneda: si viene, solo ARS o USD.
  if ("moneda" in row && get("moneda")) {
    const m = get("moneda").toUpperCase();
    if (m !== "ARS" && m !== "USD") {
      errors.push({ column: "moneda", message: "Moneda debe ser ARS o USD" });
    }
  }

  // Precio/monto: si viene, numérico y no negativo.
  for (const numCol of ["precio", "monto"]) {
    if (numCol in row && get(numCol)) {
      const n = Number(get(numCol).replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        errors.push({ column: numCol, message: "Debe ser un número válido (>= 0)" });
      }
    }
  }

  return errors;
}

/** Resultado de validar una planilla completa. */
export type ImportValidation = {
  total: number;
  valid: number;
  invalid: number;
  errors: { row: number; errors: RowError[] }[];
};

export function validateImport(
  entity: ImportEntity,
  rows: Record<string, unknown>[]
): ImportValidation {
  const errors: { row: number; errors: RowError[] }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rowErrors = validateImportRow(entity, rows[i]);
    if (rowErrors.length) errors.push({ row: i + 2, errors: rowErrors }); // +2: fila 1 = encabezado
  }
  return {
    total: rows.length,
    valid: rows.length - errors.length,
    invalid: errors.length,
    errors,
  };
}

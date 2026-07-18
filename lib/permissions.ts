import { Role, UserStatus } from "@/lib/generated/prisma/enums";

/**
 * Central authorization layer. Kept framework-agnostic (pure functions over a
 * Principal) so it can be reused by the web app AND, later, the WhatsApp
 * assistant. Do NOT duplicate access rules elsewhere — extend them here.
 *
 * Model: each user carries an explicit `permissions` list. Assigning a role
 * initializes it with that role's defaults; an Admin can then adjust each
 * user's permissions individually. ADMIN bypasses permission checks.
 */
export type Principal = {
  id: string;
  role: Role | null;
  status: UserStatus;
  permissions: string[];
};

// ---------------------------------------------------------------------------
// Registro de permisos (categorías visibles en el Panel de Control)
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  {
    key: "records.view_all",
    group: "Alcance",
    label: "Ver toda la cartera",
    help: "Clientes, oportunidades y presupuestos de todos los vendedores. Sin esto, solo ve lo propio.",
  },
  {
    key: "clients.manage",
    group: "Clientes",
    label: "Crear y editar clientes",
    help: "Alta, edición, contactos e importación por Excel.",
  },
  {
    key: "clients.assign",
    group: "Clientes",
    label: "Asignar carteras",
    help: "Transferir clientes y oportunidades entre vendedores.",
  },
  {
    key: "opportunities.manage",
    group: "Pipeline",
    label: "Gestionar oportunidades",
    help: "Crear, editar y mover oportunidades en el tablero.",
  },
  {
    key: "quotes.manage",
    group: "Presupuestos",
    label: "Gestionar presupuestos",
    help: "Crear, editar, revisar y cambiar estados.",
  },
  {
    key: "ledger.manage",
    group: "Financiero",
    label: "Cuenta corriente y cobranzas",
    help: "Registrar facturas y pagos, facturar presupuestos, panel de cobranzas.",
  },
  {
    key: "expenses.manage",
    group: "Financiero",
    label: "Gastos, costos y balance",
    help: "Ver todos los gastos, administrar categorías de costo y el balance mensual.",
  },
  {
    key: "products.manage",
    group: "Catálogo",
    label: "Gestionar productos y precios",
    help: "Alta, edición e importación de listas de precios.",
  },
  {
    key: "admin.users",
    group: "Administración",
    label: "Gestionar usuarios y permisos",
    help: "Activar usuarios, asignar roles y ajustar permisos.",
  },
  {
    key: "admin.company",
    group: "Administración",
    label: "Configuración de la empresa",
    help: "Datos fiscales, logo y diseño base del presupuesto.",
  },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map(
  (p) => p.key
);

/** Paquete de permisos inicial de cada rol (ajustable por usuario después). */
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, PermissionKey[]> = {
  [Role.ADMIN]: [...ALL_PERMISSION_KEYS],
  [Role.MANAGER]: [
    "records.view_all",
    "clients.manage",
    "clients.assign",
    "opportunities.manage",
    "quotes.manage",
    "ledger.manage",
    "expenses.manage",
    "products.manage",
  ],
  [Role.SALES]: ["clients.manage", "opportunities.manage", "quotes.manage"],
  [Role.ADMINISTRATION]: [
    "records.view_all",
    "ledger.manage",
    "expenses.manage",
    "products.manage",
  ],
  [Role.READ_ONLY]: ["records.view_all"],
};

/** Human-readable role labels for the Spanish UI. */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: "Administrador",
  [Role.MANAGER]: "Gerente",
  [Role.SALES]: "Vendedor",
  [Role.ADMINISTRATION]: "Administración",
  [Role.READ_ONLY]: "Solo lectura",
};

// ---------------------------------------------------------------------------
// Chequeos base
// ---------------------------------------------------------------------------

export function isActive(principal: Principal | null | undefined): boolean {
  return !!principal && principal.status === UserStatus.ACTIVE;
}

export function isAdmin(principal: Principal | null | undefined): boolean {
  return !!principal && principal.role === Role.ADMIN;
}

/** Core check: active + (ADMIN bypass or explicit permission). */
export function hasPermission(
  principal: Principal | null | undefined,
  key: PermissionKey
): boolean {
  if (!isActive(principal)) return false;
  if (principal!.role === Role.ADMIN) return true;
  return principal!.permissions?.includes(key) ?? false;
}

/** True when the principal owns the given record. */
export function ownsRecord(
  principal: Principal | null | undefined,
  record: { ownerId?: string | null }
): boolean {
  return !!principal && !!record.ownerId && record.ownerId === principal.id;
}

// ---------------------------------------------------------------------------
// Alcance (cartera propia vs general)
// ---------------------------------------------------------------------------

export function canViewAllRecords(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "records.view_all");
}

/** Visibility rule reused by CRM modules and the AI assistant. */
export function canViewRecord(
  principal: Principal | null | undefined,
  record: { ownerId?: string | null }
): boolean {
  if (!isActive(principal)) return false;
  return canViewAllRecords(principal) || ownsRecord(principal, record);
}

function scope(principal: Principal | null | undefined): { ownerId?: string } {
  if (canViewAllRecords(principal)) return {};
  return { ownerId: principal?.id ?? "__none__" };
}

export const clientScope = scope;
export const opportunityScope = scope;
export const quoteScope = scope;

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export function canCreateClients(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "clients.manage");
}

export function canAssignClients(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "clients.assign");
}

/** Edit any record with view-all; otherwise only own records. */
export function canEditClient(
  principal: Principal | null | undefined,
  client: { ownerId?: string | null }
): boolean {
  if (!hasPermission(principal, "clients.manage")) return false;
  return canViewAllRecords(principal) || ownsRecord(principal, client);
}

// ---------------------------------------------------------------------------
// Oportunidades
// ---------------------------------------------------------------------------

export function canCreateOpportunities(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "opportunities.manage");
}

export function canEditOpportunity(
  principal: Principal | null | undefined,
  opportunity: { ownerId?: string | null }
): boolean {
  if (!hasPermission(principal, "opportunities.manage")) return false;
  return canViewAllRecords(principal) || ownsRecord(principal, opportunity);
}

// ---------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------

export function canCreateQuotes(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "quotes.manage");
}

export function canEditQuote(
  principal: Principal | null | undefined,
  quote: { ownerId?: string | null }
): boolean {
  if (!hasPermission(principal, "quotes.manage")) return false;
  return canViewAllRecords(principal) || ownsRecord(principal, quote);
}

// ---------------------------------------------------------------------------
// Hojas de ruta (planificador de viajes)
// ---------------------------------------------------------------------------

/**
 * Armar/guardar hojas de ruta es ESCRITURA: requiere gestionar el pipeline
 * (vendedor, gerente, admin). "Solo lectura" y "Administración" pueden verlas
 * pero no crearlas. Regla compartida por la web y el asistente de IA.
 */
export function canCreateTrips(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "opportunities.manage");
}

/**
 * Editar/borrar una hoja guardada: su dueño, o un gerente/admin. OJO: no
 * alcanza con "ver toda la cartera" (eso lo tienen también Solo lectura y
 * Administración, que no deben modificar hojas ajenas).
 */
export function canManageTrip(
  principal: Principal | null | undefined,
  trip: { ownerId?: string | null }
): boolean {
  if (!canCreateTrips(principal)) return false;
  return ownsRecord(principal, trip) || canAssignClients(principal);
}

// ---------------------------------------------------------------------------
// Financiero, catálogo y administración
// ---------------------------------------------------------------------------

export function canManageLedger(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "ledger.manage");
}

/**
 * Cargar gastos propios (combustible en obra, viáticos…): cualquier rol
 * operativo — quien gestiona finanzas o quien trabaja el pipeline (vendedores
 * en el campo). Los roles de solo consulta no cargan.
 */
export function canLogExpenses(
  principal: Principal | null | undefined
): boolean {
  return (
    hasPermission(principal, "expenses.manage") ||
    hasPermission(principal, "opportunities.manage")
  );
}

/**
 * Gestión completa de gastos: ver TODOS los gastos (no solo los propios),
 * administrar categorías de costo y el balance mensual.
 */
export function canManageExpenses(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "expenses.manage");
}

export function canManageProducts(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "products.manage");
}

export function canManageUsers(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "admin.users");
}

export function canManageCompany(
  principal: Principal | null | undefined
): boolean {
  return hasPermission(principal, "admin.company");
}

/** Shows the Panel de Control nav entry. */
export function canAccessAdminPanel(
  principal: Principal | null | undefined
): boolean {
  return canManageUsers(principal) || canManageCompany(principal);
}

import { Role, UserStatus } from "@/lib/generated/prisma/enums";

/**
 * Central authorization layer. Kept framework-agnostic (pure functions over a
 * Principal) so it can be reused by the web app AND, later, the WhatsApp
 * assistant. Do NOT duplicate access rules elsewhere — extend them here.
 */
export type Principal = {
  id: string;
  role: Role | null;
  status: UserStatus;
};

export function isActive(principal: Principal | null | undefined): boolean {
  return !!principal && principal.status === UserStatus.ACTIVE;
}

export function hasRole(
  principal: Principal | null | undefined,
  ...roles: Role[]
): boolean {
  return !!principal && principal.role != null && roles.includes(principal.role);
}

export function isAdmin(principal: Principal | null | undefined): boolean {
  return hasRole(principal, Role.ADMIN);
}

/** Only admins can manage users (activate, assign roles, disable). */
export function canManageUsers(
  principal: Principal | null | undefined
): boolean {
  return isActive(principal) && isAdmin(principal);
}

export function isManager(principal: Principal | null | undefined): boolean {
  return hasRole(principal, Role.MANAGER);
}

/** Roles that can see every record (whole company), regardless of ownership. */
export function canViewAllRecords(
  principal: Principal | null | undefined
): boolean {
  return hasRole(
    principal,
    Role.ADMIN,
    Role.MANAGER,
    Role.ADMINISTRATION,
    Role.READ_ONLY
  );
}

// --- Clientes (cartera propia vs cartera general) --------------------------

/** Roles that can create clients. */
export function canCreateClients(
  principal: Principal | null | undefined
): boolean {
  return hasRole(principal, Role.ADMIN, Role.MANAGER, Role.SALES);
}

/** Only admins and managers assign/transfer clients between portfolios. */
export function canAssignClients(
  principal: Principal | null | undefined
): boolean {
  return isActive(principal) && hasRole(principal, Role.ADMIN, Role.MANAGER);
}

/** Admins and managers can edit any client; a salesperson only their own. */
export function canEditClient(
  principal: Principal | null | undefined,
  client: { ownerId?: string | null }
): boolean {
  if (!isActive(principal)) return false;
  if (hasRole(principal, Role.ADMIN, Role.MANAGER)) return true;
  return hasRole(principal, Role.SALES) && ownsRecord(principal, client);
}

/**
 * Prisma `where` scope for listing clients: managers/admins see everything,
 * a salesperson only their own portfolio. Returned as a plain object so this
 * module stays free of any framework/ORM dependency.
 */
export function clientScope(
  principal: Principal | null | undefined
): { ownerId?: string } {
  if (canViewAllRecords(principal)) return {};
  return { ownerId: principal?.id ?? "__none__" };
}

// --- Oportunidades (misma lógica de cartera que clientes) ------------------

export function canCreateOpportunities(
  principal: Principal | null | undefined
): boolean {
  return hasRole(principal, Role.ADMIN, Role.MANAGER, Role.SALES);
}

/** Admins/managers edit any opportunity; a salesperson only their own. */
export function canEditOpportunity(
  principal: Principal | null | undefined,
  opportunity: { ownerId?: string | null }
): boolean {
  if (!isActive(principal)) return false;
  if (hasRole(principal, Role.ADMIN, Role.MANAGER)) return true;
  return hasRole(principal, Role.SALES) && ownsRecord(principal, opportunity);
}

/** Prisma `where` scope for listing opportunities by portfolio. */
export function opportunityScope(
  principal: Principal | null | undefined
): { ownerId?: string } {
  if (canViewAllRecords(principal)) return {};
  return { ownerId: principal?.id ?? "__none__" };
}

// --- Presupuestos (misma lógica de cartera) --------------------------------

export function canCreateQuotes(
  principal: Principal | null | undefined
): boolean {
  return hasRole(principal, Role.ADMIN, Role.MANAGER, Role.SALES);
}

export function canEditQuote(
  principal: Principal | null | undefined,
  quote: { ownerId?: string | null }
): boolean {
  if (!isActive(principal)) return false;
  if (hasRole(principal, Role.ADMIN, Role.MANAGER)) return true;
  return hasRole(principal, Role.SALES) && ownsRecord(principal, quote);
}

export function quoteScope(
  principal: Principal | null | undefined
): { ownerId?: string } {
  if (canViewAllRecords(principal)) return {};
  return { ownerId: principal?.id ?? "__none__" };
}

/** True when the principal owns the given record. */
export function ownsRecord(
  principal: Principal | null | undefined,
  record: { ownerId?: string | null }
): boolean {
  return !!principal && !!record.ownerId && record.ownerId === principal.id;
}

/**
 * Core visibility rule: an active manager/admin sees everything; a salesperson
 * sees only their own records. Reused by CRM modules and the AI assistant.
 */
export function canViewRecord(
  principal: Principal | null | undefined,
  record: { ownerId?: string | null }
): boolean {
  if (!isActive(principal)) return false;
  return canViewAllRecords(principal) || ownsRecord(principal, record);
}

/** Human-readable role labels for the Spanish UI. */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: "Administrador",
  [Role.MANAGER]: "Gerente",
  [Role.SALES]: "Vendedor",
  [Role.ADMINISTRATION]: "Administración",
  [Role.READ_ONLY]: "Solo lectura",
};

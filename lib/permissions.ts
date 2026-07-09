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

/** Roles that can see every record, regardless of ownership. */
export function canViewAllRecords(
  principal: Principal | null | undefined
): boolean {
  return hasRole(principal, Role.ADMIN, Role.MANAGER, Role.ADMINISTRATION);
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

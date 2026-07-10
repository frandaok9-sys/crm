"use server";

import { requireActiveUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { getAuditEntries } from "@/lib/audit-log";
import type { AuditFilters, AuditPage } from "@/lib/audit-shared";

/** Consulta paginada del registro de auditoría. Solo para quien gestiona usuarios. */
export async function fetchAuditLog(filters: AuditFilters): Promise<AuditPage> {
  const user = await requireActiveUser();
  if (!canManageUsers(user)) {
    throw new Error("No tenés permiso para ver el registro de auditoría.");
  }
  return getAuditEntries(filters);
}

"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageUsers, canAssignClients } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
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

// ---------------------------------------------------------------------------
// Reasignación de cartera (transferir todo lo de un vendedor a otro)
// ---------------------------------------------------------------------------

export type PortfolioCounts = {
  clients: number;
  opportunities: number;
  quotes: number;
};

/** Cuántos registros tiene la cartera de un vendedor (para la vista previa). */
export async function portfolioSummary(userId: string): Promise<PortfolioCounts> {
  const user = await requireActiveUser();
  if (!canAssignClients(user)) {
    throw new Error("No tenés permiso para reasignar carteras.");
  }
  const [clients, opportunities, quotes] = await Promise.all([
    prisma.client.count({ where: { ownerId: userId } }),
    prisma.opportunity.count({ where: { ownerId: userId } }),
    prisma.quote.count({ where: { ownerId: userId } }),
  ]);
  return { clients, opportunities, quotes };
}

/** Mueve TODA la cartera (clientes, oportunidades y presupuestos) de un vendedor a otro. */
export async function reassignPortfolio(
  fromId: string,
  toId: string
): Promise<PortfolioCounts> {
  const admin = await requireActiveUser();
  if (!canAssignClients(admin)) {
    throw new Error("No tenés permiso para reasignar carteras.");
  }
  if (!fromId || !toId) throw new Error("Elegí el vendedor de origen y el de destino.");
  if (fromId === toId) throw new Error("El origen y el destino no pueden ser el mismo.");

  const [from, to] = await Promise.all([
    prisma.user.findUnique({ where: { id: fromId }, select: { id: true, name: true, email: true } }),
    prisma.user.findUnique({ where: { id: toId }, select: { id: true, name: true, email: true } }),
  ]);
  if (!from || !to) throw new Error("Vendedor inválido.");

  // Todo dentro de una transacción: o se mueve todo, o no se mueve nada.
  const [clients, opportunities, quotes] = await prisma.$transaction([
    prisma.client.updateMany({ where: { ownerId: fromId }, data: { ownerId: toId } }),
    prisma.opportunity.updateMany({ where: { ownerId: fromId }, data: { ownerId: toId } }),
    prisma.quote.updateMany({ where: { ownerId: fromId }, data: { ownerId: toId } }),
  ]);

  const moved: PortfolioCounts = {
    clients: clients.count,
    opportunities: opportunities.count,
    quotes: quotes.count,
  };

  await logAudit({
    action: "cartera.reassigned",
    actorId: admin.id,
    targetType: "User",
    targetId: toId,
    metadata: {
      fromName: from.name ?? from.email ?? fromId,
      toName: to.name ?? to.email ?? toId,
      ...moved,
    },
  });

  revalidatePath("/clientes");
  revalidatePath("/oportunidades");
  revalidatePath("/presupuestos");
  revalidatePath("/admin");
  return moved;
}

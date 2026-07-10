"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canManageUsers,
  canAssignClients,
  canManageCompany,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { STAGE_HEX } from "@/lib/stage-colors";
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

// ---------------------------------------------------------------------------
// Configuración del pipeline (etapas)
// ---------------------------------------------------------------------------

const VALID_COLORS = Object.keys(STAGE_HEX);

async function requireCompanyAdmin() {
  const admin = await requireActiveUser();
  if (!canManageCompany(admin)) {
    throw new Error("No tenés permiso para configurar el pipeline.");
  }
  return admin;
}

export async function createStage(name: string, color: string): Promise<void> {
  const admin = await requireCompanyAdmin();
  const clean = name.trim();
  if (!clean) throw new Error("Poné un nombre para la etapa.");
  const safeColor = VALID_COLORS.includes(color) ? color : "gray";
  const last = await prisma.stage.findFirst({ orderBy: { position: "desc" } });
  const stage = await prisma.stage.create({
    data: { name: clean, color: safeColor, position: (last?.position ?? -1) + 1 },
  });
  await logAudit({
    action: "stage.created",
    actorId: admin.id,
    targetType: "Stage",
    targetId: stage.id,
    metadata: { name: clean },
  });
  revalidatePath("/oportunidades");
  revalidatePath("/admin");
}

export async function updateStage(id: string, name: string, color: string): Promise<void> {
  const admin = await requireCompanyAdmin();
  const clean = name.trim();
  if (!clean) throw new Error("Poné un nombre para la etapa.");
  const safeColor = VALID_COLORS.includes(color) ? color : "gray";
  await prisma.stage.update({ where: { id }, data: { name: clean, color: safeColor } });
  await logAudit({
    action: "stage.updated",
    actorId: admin.id,
    targetType: "Stage",
    targetId: id,
    metadata: { name: clean },
  });
  revalidatePath("/oportunidades");
  revalidatePath("/admin");
}

/** Reordena una etapa intercambiando su posición con la vecina (arriba/abajo). */
export async function moveStage(id: string, direction: "up" | "down"): Promise<void> {
  const admin = await requireCompanyAdmin();
  const stages = await prisma.stage.findMany({ orderBy: { position: "asc" } });
  const index = stages.findIndex((s) => s.id === id);
  if (index === -1) return;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= stages.length) return;
  const a = stages[index];
  const b = stages[swapWith];
  await prisma.$transaction([
    prisma.stage.update({ where: { id: a.id }, data: { position: b.position } }),
    prisma.stage.update({ where: { id: b.id }, data: { position: a.position } }),
  ]);
  await logAudit({
    action: "stage.moved",
    actorId: admin.id,
    targetType: "Stage",
    targetId: id,
    metadata: { name: a.name, direction },
  });
  revalidatePath("/oportunidades");
  revalidatePath("/admin");
}

export async function deleteStage(id: string): Promise<void> {
  const admin = await requireCompanyAdmin();
  // Guarda de seguridad: borrar una etapa con oportunidades las borraría en
  // cascada. No se permite hasta que la etapa quede vacía.
  const count = await prisma.opportunity.count({ where: { stageId: id } });
  if (count > 0) {
    throw new Error(
      `Esta etapa tiene ${count} oportunidad(es). Movelas a otra etapa antes de eliminarla.`
    );
  }
  const stage = await prisma.stage.findUnique({ where: { id } });
  await prisma.stage.delete({ where: { id } });
  await logAudit({
    action: "stage.deleted",
    actorId: admin.id,
    targetType: "Stage",
    targetId: id,
    metadata: { name: stage?.name ?? "" },
  });
  revalidatePath("/oportunidades");
  revalidatePath("/admin");
}

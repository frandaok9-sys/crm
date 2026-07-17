"use server";

import { revalidatePath, updateTag } from "next/cache";
import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canManageUsers,
  canAssignClients,
  canManageCompany,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { STAGE_HEX } from "@/lib/stage-colors";
import { COMPANY_SETTINGS_ID, COMPANY_SETTINGS_TAG } from "@/lib/company";
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

// ---------------------------------------------------------------------------
// Alícuotas de IVA (TaxRate)
// ---------------------------------------------------------------------------

function parseRate(value: string): number {
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error("La alícuota debe ser un número entre 0 y 100.");
  }
  return n;
}

export async function createTaxRate(name: string, rate: string): Promise<void> {
  const admin = await requireCompanyAdmin();
  const clean = name.trim();
  if (!clean) throw new Error("Poné un nombre para la alícuota.");
  const value = parseRate(rate);
  const last = await prisma.taxRate.findFirst({ orderBy: { position: "desc" } });
  const created = await prisma.taxRate.create({
    data: { name: clean, rate: value.toFixed(2), position: (last?.position ?? -1) + 1 },
  });
  await logAudit({
    action: "tax_rate.created",
    actorId: admin.id,
    targetType: "TaxRate",
    targetId: created.id,
    metadata: { name: clean, rate: value },
  });
  revalidatePath("/admin");
}

export async function updateTaxRate(id: string, name: string, rate: string): Promise<void> {
  const admin = await requireCompanyAdmin();
  const clean = name.trim();
  if (!clean) throw new Error("Poné un nombre para la alícuota.");
  const value = parseRate(rate);
  await prisma.taxRate.update({
    where: { id },
    data: { name: clean, rate: value.toFixed(2) },
  });
  await logAudit({
    action: "tax_rate.updated",
    actorId: admin.id,
    targetType: "TaxRate",
    targetId: id,
    metadata: { name: clean, rate: value },
  });
  revalidatePath("/admin");
}

/** Marca una alícuota como predeterminada (y desmarca las demás). */
export async function setDefaultTaxRate(id: string): Promise<void> {
  const admin = await requireCompanyAdmin();
  await prisma.$transaction([
    prisma.taxRate.updateMany({ data: { isDefault: false } }),
    prisma.taxRate.update({ where: { id }, data: { isDefault: true } }),
  ]);
  await logAudit({
    action: "tax_rate.updated",
    actorId: admin.id,
    targetType: "TaxRate",
    targetId: id,
    metadata: { isDefault: true },
  });
  revalidatePath("/admin");
}

export async function deleteTaxRate(id: string): Promise<void> {
  const admin = await requireCompanyAdmin();
  // Los presupuestos guardan la alícuota como snapshot (no es FK), así que
  // eliminarla no rompe nada histórico; solo deja de ofrecerse en nuevos.
  const rate = await prisma.taxRate.findUnique({ where: { id } });
  await prisma.taxRate.delete({ where: { id } });
  await logAudit({
    action: "tax_rate.deleted",
    actorId: admin.id,
    targetType: "TaxRate",
    targetId: id,
    metadata: { name: rate?.name ?? "" },
  });
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Tipo de cambio (ExchangeRate)
// ---------------------------------------------------------------------------

/** Carga (o actualiza) el tipo de cambio ARS por 1 USD para una fecha. */
export async function saveExchangeRate(dateStr: string, usdToArs: string): Promise<void> {
  const admin = await requireCompanyAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error("Fecha inválida.");
  }
  // Decimal (no Number): es un valor monetario, sin redondeo flotante.
  const raw = String(usdToArs).replace(",", ".").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error("El tipo de cambio debe ser un número mayor a 0.");
  }
  const value = new Decimal(raw).toDecimalPlaces(4);
  if (value.lte(0)) {
    throw new Error("El tipo de cambio debe ser un número mayor a 0.");
  }
  const date = new Date(`${dateStr}T00:00:00Z`);
  await prisma.exchangeRate.upsert({
    where: { date },
    create: { date, usdToArs: value.toFixed(4) },
    update: { usdToArs: value.toFixed(4) },
  });
  await logAudit({
    action: "exchange_rate.created",
    actorId: admin.id,
    targetType: "ExchangeRate",
    metadata: { date: dateStr, usdToArs: value.toFixed(4) },
  });
  revalidatePath("/admin");
  revalidatePath("/metricas");
}

export async function deleteExchangeRate(id: string): Promise<void> {
  const admin = await requireCompanyAdmin();
  await prisma.exchangeRate.delete({ where: { id } });
  await logAudit({
    action: "exchange_rate.deleted",
    actorId: admin.id,
    targetType: "ExchangeRate",
    targetId: id,
  });
  revalidatePath("/admin");
  revalidatePath("/metricas");
}

// ---------------------------------------------------------------------------
// Configuración de Facturación Electrónica AFIP (no secreta)
// ---------------------------------------------------------------------------

/**
 * Guarda el punto de venta y el entorno (prueba/producción) de AFIP. El
 * certificado y la clave privada NO se cargan acá: son secretos y van en
 * variables de entorno.
 */
export async function saveAfipConfig(
  puntoVenta: string,
  env: string
): Promise<void> {
  const admin = await requireCompanyAdmin();
  const pv = /^\d+$/.test(puntoVenta.trim()) ? Number(puntoVenta.trim()) : null;
  const afipEnv = env === "produccion" ? "produccion" : "homologacion";

  await prisma.companySettings.upsert({
    where: { id: COMPANY_SETTINGS_ID },
    create: { id: COMPANY_SETTINGS_ID, afipPuntoVenta: pv, afipEnv },
    update: { afipPuntoVenta: pv, afipEnv },
  });

  await logAudit({
    action: "company.settings_updated",
    actorId: admin.id,
    targetType: "CompanySettings",
    targetId: COMPANY_SETTINGS_ID,
    metadata: { afipPuntoVenta: pv, afipEnv },
  });
  updateTag(COMPANY_SETTINGS_TAG);
  revalidatePath("/admin");
}


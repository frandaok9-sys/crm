import { prisma } from "@/lib/prisma";
import { normalizeCuit } from "@/lib/nexus/canonical";
import {
  SyncDirection,
  SyncResult,
  TenantStatus,
  TenantVia,
} from "@/lib/generated/prisma/enums";

/**
 * NEXUS — Central: escritura/lectura de tenants y del registro de
 * sincronización. Reusa el modelo canónico (lib/nexus/canonical). Usa Prisma,
 * así que es solo-servidor.
 */

// ---------------------------------------------------------------------------
// Registro de sincronización + idempotencia (guía §3.2 y §3.5)
// ---------------------------------------------------------------------------

export type SyncEvent = {
  tenantId?: string | null;
  eventId?: string | null; // id único del evento de origen (idempotencia)
  entity: string;
  direction?: SyncDirection;
  result?: SyncResult;
  externalId?: string | null;
  nexusId?: string | null;
  source?: string | null;
  detail?: string | null;
};

/**
 * Registra un evento de sincronización. Si el (tenantId, eventId) ya existe,
 * lo descarta silenciosamente (idempotencia: el mismo evento nunca se procesa
 * dos veces). Nunca lanza — la observabilidad no debe romper el flujo.
 */
export async function logSync(event: SyncEvent): Promise<SyncResult> {
  try {
    // Idempotencia: si ya procesamos este evento, marcarlo SKIPPED sin re-hacer.
    if (event.tenantId && event.eventId) {
      const existing = await prisma.syncLog.findUnique({
        where: { tenantId_eventId: { tenantId: event.tenantId, eventId: event.eventId } },
      });
      if (existing) return SyncResult.SKIPPED;
    }
    const result = event.result ?? SyncResult.OK;
    await prisma.syncLog.create({
      data: {
        tenantId: event.tenantId ?? null,
        eventId: event.eventId ?? null,
        entity: event.entity,
        direction: event.direction ?? SyncDirection.INTERNAL,
        result,
        externalId: event.externalId ?? null,
        nexusId: event.nexusId ?? null,
        source: event.source ?? null,
        detail: event.detail ?? null,
      },
    });
    return result;
  } catch {
    // Choque de unicidad (evento repetido en carrera) → idempotente.
    return SyncResult.SKIPPED;
  }
}

// ---------------------------------------------------------------------------
// Tenants (empresas conectadas)
// ---------------------------------------------------------------------------

export async function listTenants() {
  return prisma.tenant.findMany({ orderBy: { createdAt: "asc" } });
}

/** Alta de empresa (guía §4, Día 1 — "crear el espacio"). CUIT = identidad. */
export async function createTenant(input: {
  name: string;
  cuit: string;
  via?: TenantVia;
  plan?: string;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("La razón social es obligatoria.");
  const { value, valid } = normalizeCuit(input.cuit);
  if (!valid || !value) throw new Error("El CUIT es inválido.");

  const dup = await prisma.tenant.findUnique({ where: { cuit: value } });
  if (dup) throw new Error("Ya existe una empresa con ese CUIT.");

  const tenant = await prisma.tenant.create({
    data: {
      name,
      cuit: value,
      via: input.via ?? TenantVia.A,
      plan: input.plan?.trim() || "base",
      status: TenantStatus.ONBOARDING,
    },
  });
  await logSync({
    tenantId: tenant.id,
    eventId: `tenant.created:${tenant.id}`,
    entity: "tenant",
    direction: SyncDirection.INTERNAL,
    result: SyncResult.OK,
    nexusId: tenant.id,
    source: "central",
    detail: `Alta de empresa ${name}`,
  });
  return tenant;
}

// ---------------------------------------------------------------------------
// Panel de salud (guía §3.6)
// ---------------------------------------------------------------------------

export type TenantHealth = {
  id: string;
  name: string;
  cuit: string;
  via: TenantVia;
  status: TenantStatus;
  clients: number;
  opportunities: number;
  quotes: number;
  lastSyncAt: Date | null;
  errors24h: number;
};

/**
 * Estado de salud por empresa: volumen + última sincronización + errores.
 * Usa agregaciones agrupadas (no N+1) para escalar a muchas empresas.
 */
export async function tenantHealth(): Promise<TenantHealth[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [tenants, clientG, oppG, quoteG, syncG, errG] = await Promise.all([
    prisma.tenant.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.client.groupBy({ by: ["tenantId"], _count: { _all: true } }),
    prisma.opportunity.groupBy({ by: ["tenantId"], _count: { _all: true } }),
    prisma.quote.groupBy({ by: ["tenantId"], _count: { _all: true } }),
    prisma.syncLog.groupBy({ by: ["tenantId"], _max: { createdAt: true } }),
    prisma.syncLog.groupBy({
      by: ["tenantId"],
      where: { result: SyncResult.ERROR, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const countMap = (rows: { tenantId: string | null; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.tenantId ?? "", r._count._all]));
  const clients = countMap(clientG);
  const opps = countMap(oppG);
  const quotes = countMap(quoteG);
  const errors = countMap(errG);
  const lastSync = new Map(syncG.map((r) => [r.tenantId ?? "", r._max.createdAt]));

  return tenants.map((t) => ({
    id: t.id,
    name: t.name,
    cuit: t.cuit,
    via: t.via,
    status: t.status,
    clients: clients.get(t.id) ?? 0,
    opportunities: opps.get(t.id) ?? 0,
    quotes: quotes.get(t.id) ?? 0,
    lastSyncAt: lastSync.get(t.id) ?? null,
    errors24h: errors.get(t.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Interconexión: actividad canónica + tenant por defecto
// ---------------------------------------------------------------------------

/**
 * Tenant activo por defecto. Mientras la central opera una sola empresa (RC),
 * los datos nuevos se asignan a ese tenant. Cuando haya multi-empresa real,
 * esta resolución pasa a ser por usuario/sesión.
 */
export async function defaultTenantId(): Promise<string | null> {
  const t = await prisma.tenant.findFirst({
    where: { status: { in: [TenantStatus.ACTIVE, TenantStatus.ONBOARDING] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return t?.id ?? null;
}

/** Registra una actividad canónica (historial inmutable). Nunca lanza. */
export async function recordActivity(input: {
  tenantId?: string | null;
  type: string;
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  detail?: string;
}): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        tenantId: input.tenantId ?? null,
        type: input.type,
        userId: input.userId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        detail: input.detail ?? null,
      },
    });
  } catch {
    // la observabilidad no debe romper el flujo de negocio
  }
}

/**
 * Interconexión de alto nivel: registra en la central un alta/edición ocurrida
 * en la app (actividad canónica + evento de sincronización interno). Es el
 * puente entre las acciones del CRM y el "cerebro" Nexus.
 */
export async function recordCanonicalEvent(input: {
  tenantId: string | null;
  entity: "client" | "opportunity" | "quote";
  action: "created" | "updated";
  nexusId: string;
  userId?: string | null;
  detail?: string;
}): Promise<void> {
  await Promise.all([
    recordActivity({
      tenantId: input.tenantId,
      type: `${input.entity}.${input.action}`,
      userId: input.userId,
      entityType: input.entity[0].toUpperCase() + input.entity.slice(1),
      entityId: input.nexusId,
      detail: input.detail,
    }),
    logSync({
      tenantId: input.tenantId,
      eventId: `${input.entity}.${input.action}:${input.nexusId}:${Date.now()}`,
      entity: input.entity,
      direction: SyncDirection.INTERNAL,
      result: SyncResult.OK,
      nexusId: input.nexusId,
      source: "central",
      detail: input.detail,
    }),
  ]);
}

/** Últimos eventos del registro de sincronización (para el panel Nexus). */
export async function recentSyncLog(limit = 40) {
  return prisma.syncLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { tenant: { select: { name: true } } },
  });
}

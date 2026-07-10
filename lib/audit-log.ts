import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  actionLabel,
  actionsForCategory,
  type AuditFilters,
  type AuditPage,
  type AuditEntry,
} from "@/lib/audit-shared";

/**
 * Lectura del registro de auditoría para el panel (usa Prisma → solo servidor).
 * Las etiquetas, categorías y tipos viven en lib/audit-shared.ts (sin Prisma)
 * para poder reusarse en el componente cliente de filtros.
 */

const PAGE_SIZE = 40;
const AR_TZ = "America/Argentina/Buenos_Aires";

function parseRange(desde?: string, hasta?: string): { gte?: Date; lte?: Date } | undefined {
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const range: { gte?: Date; lte?: Date } = {};
  if (isDate(desde)) range.gte = new Date(`${desde}T00:00:00-03:00`);
  if (isDate(hasta)) range.lte = new Date(`${hasta}T23:59:59.999-03:00`);
  return range.gte || range.lte ? range : undefined;
}

/** Intenta sacar un texto corto de la metadata para la columna "Detalle". */
function detailFrom(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ["title", "code", "name", "message", "toName", "status"]) {
    const v = m[key];
    if (typeof v === "string" && v.trim()) return v.slice(0, 80);
  }
  return null;
}

export async function getAuditEntries(filters: AuditFilters): Promise<AuditPage> {
  const page = Math.max(1, filters.page ?? 1);
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.category) {
    const acts = actionsForCategory(filters.category);
    where.action = { in: acts.length ? acts : ["__none__"] };
  }
  const range = parseRange(filters.desde, filters.hasta);
  if (range) where.createdAt = range;

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const fmt = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: AR_TZ,
  });

  const entries: AuditEntry[] = rows.map((r) => ({
    id: r.id,
    fecha: fmt.format(r.createdAt),
    actor: r.actor ? r.actor.name ?? r.actor.email ?? "—" : "Sistema",
    action: r.action,
    actionLabel: actionLabel(r.action),
    entidad: r.targetType,
    detalle: detailFrom(r.metadata),
    ip: r.ipAddress,
  }));

  return { entries, total, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

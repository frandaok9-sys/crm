import { prisma } from "@/lib/prisma";
import type { requireActiveUser } from "@/lib/auth";
import {
  clientScope,
  opportunityScope,
  quoteScope,
} from "@/lib/permissions";
import { QuoteStatus, ClientActivityType } from "@/lib/generated/prisma/enums";

type ActiveUser = Awaited<ReturnType<typeof requireActiveUser>>;

const WEEK_MS = 7 * 86_400_000;

/**
 * Cantidad de cosas que "requieren atención" para el usuario, respetando su
 * alcance de permisos. Alimenta el contador de la campana del sidebar y usa las
 * mismas señales que el bloque "Requiere atención" del dashboard:
 * clientes por completar + propuestas sin respuesta + oportunidades sin
 * actividad (>7 días) + tareas propias vencidas.
 */
export async function getAlertCount(user: ActiveUser): Promise<number> {
  const staleBefore = new Date(Date.now() - WEEK_MS);
  const [draftClients, quotesSent, quotesToReview, staleOpps, overdueTasks] =
    await Promise.all([
      prisma.client.count({
        where: { ...clientScope(user), isDraft: true },
      }),
      prisma.quote.count({
        where: { ...quoteScope(user), status: QuoteStatus.SENT },
      }),
      prisma.quote.count({
        where: { ...quoteScope(user), needsReview: true },
      }),
      prisma.opportunity.count({
        where: {
          ...opportunityScope(user),
          stage: { name: { notIn: ["Ganada", "Perdida"] } },
          updatedAt: { lt: staleBefore },
        },
      }),
      prisma.clientActivity.count({
        where: {
          createdById: user.id,
          type: ClientActivityType.TASK,
          doneAt: null,
          dueAt: { lt: new Date() },
        },
      }),
    ]
  );

  return draftClients + quotesSent + quotesToReview + staleOpps + overdueTasks;
}

export type NotificationTone = "red" | "amber" | "blue";

export type AppNotification = {
  id: string;
  tone: NotificationTone;
  title: string;
  subtitle: string;
  href: string; // adónde lleva el clic para resolverla
};

const PER_KIND = 5; // tope por tipo, para no inundar el panel

/**
 * Lista detallada de novedades para el panel de la campana. Cada ítem es un
 * registro concreto con su link directo (no un conteo). Mismo alcance de
 * permisos y mismas señales que el contador y el bloque "Requiere atención".
 */
export async function getNotifications(user: ActiveUser): Promise<AppNotification[]> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - WEEK_MS);

  const [reviewQuotes, overdueTasks, staleOpps, sentQuotes, draftClients] =
    await Promise.all([
    prisma.quote.findMany({
      where: { ...quoteScope(user), needsReview: true },
      select: {
        id: true,
        code: true,
        version: true,
        client: { select: { legalName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
    }),
    prisma.clientActivity.findMany({
      where: {
        createdById: user.id,
        type: ClientActivityType.TASK,
        doneAt: null,
        dueAt: { lt: now },
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        client: { select: { id: true, legalName: true } },
      },
      orderBy: { dueAt: "asc" },
      take: PER_KIND,
    }),
    prisma.opportunity.findMany({
      where: {
        ...opportunityScope(user),
        stage: { name: { notIn: ["Ganada", "Perdida"] } },
        updatedAt: { lt: staleBefore },
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        client: { select: { legalName: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: PER_KIND,
    }),
    prisma.quote.findMany({
      where: { ...quoteScope(user), status: QuoteStatus.SENT },
      select: {
        id: true,
        code: true,
        version: true,
        client: { select: { legalName: true } },
      },
      orderBy: { createdAt: "asc" },
      take: PER_KIND,
    }),
    prisma.client.findMany({
      where: { ...clientScope(user), isDraft: true },
      select: { id: true, legalName: true },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
    }),
  ]);

  const days = (from: Date) =>
    Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));

  const out: AppNotification[] = [];

  for (const q of reviewQuotes) {
    const code = q.version > 1 ? `${q.code} (Rev.${q.version})` : q.code;
    out.push({
      id: `review-${q.id}`,
      tone: "red",
      title: `Presupuesto por completar: ${code}`,
      subtitle: `${q.client.legalName} · creado por el asistente, revisá precios y envialo`,
      href: `/presupuestos/${q.id}/editar`,
    });
  }
  for (const t of overdueTasks) {
    const d = t.dueAt ? days(t.dueAt) : 0;
    out.push({
      id: `task-${t.id}`,
      tone: "red",
      title: `Tarea vencida: ${t.title}`,
      subtitle: `${t.client.legalName} · venció hace ${d} día${d === 1 ? "" : "s"}`,
      href: `/clientes/${t.client.id}`,
    });
  }
  for (const o of staleOpps) {
    const d = days(o.updatedAt);
    out.push({
      id: `opp-${o.id}`,
      tone: "amber",
      title: `Oportunidad sin avanzar: ${o.title}`,
      subtitle: `${o.client.legalName} · ${d} día${d === 1 ? "" : "s"} sin actividad`,
      href: `/oportunidades/${o.id}`,
    });
  }
  for (const q of sentQuotes) {
    const code = q.version > 1 ? `${q.code} (Rev.${q.version})` : q.code;
    out.push({
      id: `quote-${q.id}`,
      tone: "blue",
      title: `Presupuesto sin respuesta: ${code}`,
      subtitle: `${q.client.legalName} · enviado, esperando aprobación`,
      href: `/presupuestos/${q.id}`,
    });
  }
  for (const c of draftClients) {
    out.push({
      id: `client-${c.id}`,
      tone: "amber",
      title: `Cliente por completar: ${c.legalName}`,
      subtitle: "Cargale CUIT, condición de IVA y contacto",
      href: `/clientes/${c.id}`,
    });
  }

  return out;
}

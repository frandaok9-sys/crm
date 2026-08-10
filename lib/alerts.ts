import { prisma } from "@/lib/prisma";
import type { requireActiveUser } from "@/lib/auth";
import {
  clientScope,
  opportunityScope,
  quoteScope,
} from "@/lib/permissions";
import { QuoteStatus, ClientActivityType } from "@/lib/generated/prisma/enums";
import { latestRevisions } from "@/lib/quotes";
import { getOverdueInvoices } from "@/lib/receivables";

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
  const [
    draftClients,
    allQuoteRows,
    quotesToReview,
    staleOpps,
    overdueTasks,
    assignedTasks,
  ] = await Promise.all([
      prisma.client.count({
        where: { ...clientScope(user), isDraft: true },
      }),
      // Todas las revisiones: un presupuesto "sin respuesta" es el que quedó
      // ENVIADO en su ÚLTIMA revisión (no una Rev.1 ya superada).
      prisma.quote.findMany({
        where: { ...quoteScope(user) },
        select: { id: true, rootId: true, version: true, status: true },
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
          assignedToId: null,
          type: ClientActivityType.TASK,
          doneAt: null,
          dueAt: { lt: new Date() },
        },
      }),
      // Tareas que me delegaron y todavía no respondí: siempre cuentan.
      prisma.clientActivity.count({
        where: {
          assignedToId: user.id,
          type: ClientActivityType.TASK,
          doneAt: null,
        },
      }),
    ]
  );

  const quotesSent = latestRevisions(allQuoteRows).filter(
    (q) => q.status === QuoteStatus.SENT
  ).length;

  // Facturas vencidas sin cobrar: la alerta es para quien las cargó.
  const overdueInvoices = (await getOverdueInvoices()).filter(
    (inv) => inv.createdById === user.id
  ).length;

  return (
    draftClients +
    quotesSent +
    quotesToReview +
    staleOpps +
    overdueTasks +
    assignedTasks +
    overdueInvoices
  );
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

  const [
    reviewQuotes,
    assignedTasks,
    confirmedTasks,
    overdueTasks,
    staleOpps,
    sentQuoteRows,
    allQuoteVersions,
    draftClients,
    allOverdueInvoices,
  ] = await Promise.all([
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
    // Tareas que OTRO usuario me delegó y espero responder/confirmar.
    prisma.clientActivity.findMany({
      where: {
        assignedToId: user.id,
        type: ClientActivityType.TASK,
        doneAt: null,
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        quoteId: true,
        quote: { select: { code: true } },
        opportunityId: true,
        opportunity: { select: { title: true } },
        createdBy: { select: { name: true, email: true } },
        client: { select: { id: true, legalName: true } },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: PER_KIND,
    }),
    // Tareas que YO delegué y el asignado confirmó hace poco (con su respuesta).
    prisma.clientActivity.findMany({
      where: {
        createdById: user.id,
        assignedToId: { not: null },
        type: ClientActivityType.TASK,
        doneAt: { gte: new Date(now.getTime() - WEEK_MS) },
      },
      select: {
        id: true,
        title: true,
        reply: true,
        quoteId: true,
        opportunityId: true,
        assignedTo: { select: { name: true, email: true } },
        client: { select: { id: true, legalName: true } },
      },
      orderBy: { doneAt: "desc" },
      take: PER_KIND,
    }),
    prisma.clientActivity.findMany({
      where: {
        createdById: user.id,
        assignedToId: null,
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
    // ENVIADOS: se traen de más y después se descartan las revisiones ya
    // superadas (una Rev.1 enviada con Rev.2 aprobada no es "sin respuesta").
    prisma.quote.findMany({
      where: { ...quoteScope(user), status: QuoteStatus.SENT },
      select: {
        id: true,
        rootId: true,
        version: true,
        code: true,
        client: { select: { legalName: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 25,
    }),
    prisma.quote.findMany({
      where: { ...quoteScope(user) },
      select: { id: true, rootId: true, version: true },
    }),
    prisma.client.findMany({
      where: { ...clientScope(user), isDraft: true },
      select: { id: true, legalName: true },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
    }),
    getOverdueInvoices(),
  ]);

  // Facturas vencidas: la alerta le llega a QUIEN LAS CARGÓ.
  const overdueInvoices = allOverdueInvoices
    .filter((inv) => inv.createdById === user.id)
    .slice(0, PER_KIND);

  const days = (from: Date) =>
    Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));

  // Solo los enviados cuya revisión sea la vigente (no superada por otra).
  const maxVersionByGroup = new Map<string, number>();
  for (const q of allQuoteVersions) {
    const group = q.rootId ?? q.id;
    maxVersionByGroup.set(
      group,
      Math.max(maxVersionByGroup.get(group) ?? 0, q.version)
    );
  }
  const sentQuotes = sentQuoteRows
    .filter((q) => q.version === maxVersionByGroup.get(q.rootId ?? q.id))
    .slice(0, PER_KIND);

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
  for (const inv of overdueInvoices) {
    const symbol = inv.currency === "USD" ? "US$" : "$";
    const term =
      inv.termDays === 0
        ? "contado"
        : inv.termDays
        ? `${inv.termDays} días`
        : "sin condición";
    out.push({
      id: `invoice-${inv.id}`,
      tone: "red",
      title: `Factura impaga${inv.reference ? ` ${inv.reference}` : ""}: ${inv.legalName}`,
      subtitle: `${symbol} ${Number(inv.remaining).toLocaleString("es-AR")} pendiente · venció hace ${inv.daysLate} día${inv.daysLate === 1 ? "" : "s"} (condición: ${term})`,
      href: `/clientes/${inv.clientId}/cuenta`,
    });
  }
  for (const t of assignedTasks) {
    const overdue = t.dueAt && t.dueAt < now;
    const who = t.createdBy.name ?? t.createdBy.email;
    out.push({
      id: `delegated-${t.id}`,
      tone: overdue ? "red" : "blue",
      title: `Tarea delegada por ${who}: ${t.title}`,
      subtitle: t.quote
        ? `Presupuesto ${t.quote.code} (${t.client.legalName}) · respondé y confirmá`
        : t.opportunity
        ? `Oportunidad "${t.opportunity.title}" (${t.client.legalName}) · respondé y confirmá`
        : `${t.client.legalName} · respondé y confirmá desde la ficha del cliente`,
      href: t.quoteId
        ? `/presupuestos/${t.quoteId}`
        : t.opportunityId
        ? `/oportunidades/${t.opportunityId}`
        : `/clientes/${t.client.id}`,
    });
  }
  for (const t of confirmedTasks) {
    const who = t.assignedTo ? t.assignedTo.name ?? t.assignedTo.email : "el asignado";
    out.push({
      id: `confirmed-${t.id}`,
      tone: "blue",
      title: `Tarea confirmada por ${who}: ${t.title}`,
      subtitle: t.reply
        ? `${t.client.legalName} · "${t.reply.slice(0, 120)}"`
        : t.client.legalName,
      href: t.quoteId
        ? `/presupuestos/${t.quoteId}`
        : t.opportunityId
        ? `/oportunidades/${t.opportunityId}`
        : `/clientes/${t.client.id}`,
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

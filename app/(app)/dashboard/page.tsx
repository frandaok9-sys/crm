import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  clientScope,
  opportunityScope,
  quoteScope,
  canCreateOpportunities,
  canViewAllRecords,
} from "@/lib/permissions";
import { stageHex } from "@/lib/stage-colors";
import { IOS, monthlyBuckets, lighten, soft } from "@/lib/design";
import { getNotifications } from "@/lib/alerts";
import { latestRevisions } from "@/lib/quotes";
import { getOverdueInvoices } from "@/lib/receivables";
import {
  QuoteStatus,
  ClientActivityType,
  UserStatus,
} from "@/lib/generated/prisma/enums";
import { SellerFilter } from "@/components/seller-filter";
import { Button } from "@/components/ui/button";
import { MetricCard, type MetricTrend } from "@/components/metric-card";
import { DashboardNotifications } from "@/components/dashboard-notifications";
import { toggleActivityDone } from "../clientes/actions";

type Alert = { color: string; title: string; subtitle: string };

const METRIC_ICONS = {
  clientes:
    "M9 10a3 3 0 100-6 3 3 0 000 6M3.5 20a5.5 5.5 0 0111 0M16 4.5a3 3 0 010 6M18 14.5a5.5 5.5 0 013 4.5",
  pipeline: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 100 8 4 4 0 000-8z",
  doc: "M7 3h8l4 4v14H7zM15 3v4h4M10 13h6M10 17h6",
  check: "M4 12l5 5 11-11",
} as const;

const BAR_QUOTED = "#5B82D6";
const BAR_APPROVED = "#E0503A";

/** Tendencia "+N este mes" a partir de la última cubeta mensual. */
function thisMonthTrend(series: number[]): MetricTrend | undefined {
  const cur = series[series.length - 1] ?? 0;
  return cur > 0 ? { text: `+${cur}`, dir: "up" } : undefined;
}

function todayKicker(): string {
  return new Date()
    .toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
    .toUpperCase();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const user = await requireActiveUser();
  const firstName = (user.name ?? user.email ?? "").split(" ")[0];
  const [notifications, allOverdueInvoices] = await Promise.all([
    getNotifications(user),
    getOverdueInvoices(),
  ]);
  // Facturas vencidas cargadas POR MÍ: quedan fijadas en Mis tareas hasta
  // que se les impute el pago (se "cumplen" solas al cobrarse).
  const myOverdueInvoices = allOverdueInvoices.filter(
    (inv) => inv.createdById === user.id
  );

  // Filtro por usuario (solo admin/gerente): el Inicio mide a una persona en
  // particular — incluidos ellos mismos. Notificaciones y Mis tareas siguen
  // siendo SIEMPRE las propias de quien mira.
  const companyWide = canViewAllRecords(user);
  const activeUsers = companyWide
    ? await prisma.user.findMany({
        where: { status: UserStatus.ACTIVE },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];
  // Por defecto cada uno arranca viendo LO SUYO; "Todos" es una elección
  // explícita (?v=all). Excepción: Reinaldo (dueño) arranca con el general.
  const defaultsToGeneral =
    user.email === "reinaldo@rcpisosindustriales.com.ar";
  let filter: string | null;
  if (!companyWide) {
    filter = null; // un vendedor ya ve solo lo suyo
  } else if (v === "all") {
    filter = null;
  } else if (v && activeUsers.some((u) => u.id === v)) {
    filter = v;
  } else {
    filter = defaultsToGeneral ? null : user.id;
  }
  const filteredUser = filter
    ? activeUsers.find((u) => u.id === filter)
    : null;
  const ownerFilter = filter ? { ownerId: filter } : {};

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    clients,
    opportunities,
    allQuoteRows,
    draftClients,
    obras,
    opps,
    myTasks,
    clientDates,
    oppDates,
  ] = await Promise.all([
    prisma.client.count({ where: { ...clientScope(user), ...ownerFilter } }),
    prisma.opportunity.count({
      where: { ...opportunityScope(user), ...ownerFilter },
    }),
    // Todas las revisiones: el estado real de un presupuesto es el de su
    // ÚLTIMA revisión (una Rev.1 aprobada con una Rev.2 enviada cuenta
    // como enviada, no como aprobada).
    prisma.quote.findMany({
      where: { ...quoteScope(user), ...ownerFilter },
      select: {
        id: true,
        rootId: true,
        version: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.client.count({
      where: { ...clientScope(user), ...ownerFilter, isDraft: true },
    }),
    // Obras en ejecución (panel protagonista del Inicio).
    prisma.opportunity.findMany({
      where: {
        ...opportunityScope(user),
        ...ownerFilter,
        stage: { name: "En ejecución" },
      },
      select: {
        id: true,
        title: true,
        currency: true,
        amount: true,
        siteAddress: true,
        updatedAt: true,
        client: { select: { legalName: true } },
        expenses: { select: { amount: true, currency: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.opportunity.findMany({
      where: { ...opportunityScope(user), ...ownerFilter },
      select: {
        title: true,
        updatedAt: true,
        stageId: true,
        stage: { select: { name: true } },
        client: { select: { legalName: true } },
      },
    }),
    // Mis tareas abiertas: las que me delegaron + las mías propias, y también
    // las que YO delegué (para seguirles el rastro hasta que las confirmen).
    prisma.clientActivity.findMany({
      where: {
        type: ClientActivityType.TASK,
        doneAt: null,
        OR: [{ assignedToId: user.id }, { createdById: user.id }],
      },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 6,
      include: {
        client: { select: { id: true, legalName: true } },
        createdBy: { select: { name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    }),
    // Series de los últimos 6 meses (para sparklines y barras) — acotadas por fecha.
    prisma.client.findMany({
      where: {
        ...clientScope(user),
        ...ownerFilter,
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true },
    }),
    prisma.opportunity.findMany({
      where: {
        ...opportunityScope(user),
        ...ownerFilter,
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true },
    }),
  ]);

  // Un presupuesto = su última revisión (los contadores y series reflejan el
  // estado vigente; si se aprueba y luego se revisa y reenvía, cuenta como
  // enviado). La fecha usada es la de la emisión original (Rev.1).
  const latestQuotes = latestRevisions(allQuoteRows);
  const quotesSent = latestQuotes.filter(
    (q) => q.status === QuoteStatus.SENT
  ).length;
  const quotesApproved = latestQuotes.filter(
    (q) => q.status === QuoteStatus.APPROVED
  ).length;
  const firstDateByGroup = new Map<string, Date>();
  for (const q of allQuoteRows) {
    if (q.version === 1) firstDateByGroup.set(q.id, q.createdAt);
  }
  const quoteRows = latestQuotes
    .map((q) => ({
      status: q.status,
      createdAt: firstDateByGroup.get(q.rootId ?? q.id) ?? q.createdAt,
    }))
    .filter((q) => q.createdAt >= sixMonthsAgo);

  // Series mensuales reales (más viejo → más nuevo).
  const clientSeries = monthlyBuckets(clientDates.map((c) => c.createdAt)).map(
    (b) => b.count
  );
  const oppSeries = monthlyBuckets(oppDates.map((o) => o.createdAt)).map(
    (b) => b.count
  );
  const approvedSeries = monthlyBuckets(
    quoteRows
      .filter((q) => q.status === QuoteStatus.APPROVED)
      .map((q) => q.createdAt)
  ).map((b) => b.count);

  // Barras "Presupuestos por mes": cotizados (todos) vs aprobados.
  const quoteBuckets = monthlyBuckets(quoteRows.map((q) => q.createdAt));
  const cotizadoSeries = quoteBuckets.map((b) => b.count);
  // Presupuestos HECHOS este mes (por fecha de emisión original, cada
  // presupuesto una vez aunque tenga revisiones) = último bucket de la serie.
  const quotesThisMonth = cotizadoSeries[cotizadoSeries.length - 1] ?? 0;
  const monthLabels = quoteBuckets.map((b) => b.label);
  const maxBar = Math.max(...cotizadoSeries, 1);

  // Pipeline por etapa
  // Tareas abiertas por obra (avisos del panel "En obra").
  const obraTaskGroups = obras.length
    ? await prisma.clientActivity.groupBy({
        by: ["opportunityId"],
        where: {
          opportunityId: { in: obras.map((o) => o.id) },
          type: ClientActivityType.TASK,
          doneAt: null,
        },
        _count: { _all: true },
      })
    : [];
  const openTasksByObra = new Map(
    obraTaskGroups.map((g) => [g.opportunityId, g._count._all])
  );

  // Requiere atención (hasta 3)
  const alerts: Alert[] = [];
  const now = Date.now();
  const overdueTasks = myTasks.filter(
    (t) => t.dueAt && t.dueAt.getTime() < now
  ).length;
  if (overdueTasks > 0) {
    alerts.push({
      color: "#C43C2B",
      title: `${overdueTasks} tarea(s) vencida(s)`,
      subtitle: "Mirá el bloque Mis tareas: hay pendientes pasadas de fecha",
    });
  }
  if (draftClients > 0) {
    alerts.push({
      color: "#E0503A",
      title: `${draftClients} cliente(s) por completar`,
      subtitle: "Altas rápidas (para rutas) que faltan terminar: cargales CUIT, IVA y contacto",
    });
  }
  const stale = opps
    .filter(
      (o) =>
        !["En ejecución", "Finalizada", "Perdida"].includes(o.stage.name) &&
        now - o.updatedAt.getTime() > 7 * 86_400_000
    )
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  if (stale[0]) {
    const days = Math.floor(
      (now - stale[0].updatedAt.getTime()) / 86_400_000
    );
    alerts.push({
      color: "#D9A03C",
      title: stale[0].title,
      subtitle: `${stale[0].client.legalName} · sin actividad hace ${days} días`,
    });
  }
  if (quotesSent > 0) {
    alerts.push({
      color: "#5B82D6",
      title: `${quotesSent} propuesta(s) sin respuesta`,
      subtitle: "Presupuestos enviados esperando aprobación",
    });
  }
  const negotiating = opps.filter((o) => o.stage.name === "Negociación");
  if (negotiating.length > 0) {
    alerts.push({
      color: "#9B7BE8",
      title: `${negotiating.length} negociación(es) por cerrar`,
      subtitle: negotiating
        .slice(0, 2)
        .map((o) => o.title)
        .join(" · "),
    });
  }


  // Anillos de rendimiento (métricas reales, sin inventar):
  const totalOpps = opps.length;
  const inExecution = opps.filter((o) => o.stage.name === "En ejecución").length;
  const finished = opps.filter((o) => o.stage.name === "Finalizada").length;
  const lost = opps.filter((o) => o.stage.name === "Perdida").length;
  // Ganado = obras conseguidas (en marcha o ya terminadas).
  const won = inExecution + finished;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const rings = [
    { label: "Ganadas", value: pct(won, totalOpps), color: stageHex("green") },
    { label: "Perdidas", value: pct(lost, totalOpps), color: stageHex("red") },
    { label: "En ejecución", value: pct(inExecution, totalOpps), color: stageHex("orange") },
  ];

  return (
    <div className="space-y-7">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            {todayKicker()}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-[30px] font-semibold leading-tight">
              Hola, {firstName}
            </h1>
            <DashboardNotifications items={notifications} />
          </div>
          {filteredUser && filter !== user.id && (
            <p className="mt-1 text-sm text-muted-foreground">
              Viendo la actividad de{" "}
              <span className="font-medium">
                {filteredUser.name ?? filteredUser.email}
              </span>
              .
            </p>
          )}
          {companyWide && !filter && (
            <p className="mt-1 text-sm text-muted-foreground">
              Viendo la actividad de toda la empresa.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {companyWide && activeUsers.length > 0 && (
            <SellerFilter
              basePath="/dashboard"
              label="Usuario"
              allValue="all"
              sellers={activeUsers.map((u) => ({
                id: u.id,
                label: u.name ?? u.email,
              }))}
              current={filter}
            />
          )}
          {canCreateOpportunities(user) && (
            <Link href="/oportunidades/nueva">
              <Button size="cta">+ Nueva oportunidad</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Métricas (franja accent + ícono + tendencia + sparkline) */}
      <div className="grid grid-cols-2 gap-[14px] lg:grid-cols-3">
        <MetricCard
          label="Clientes"
          value={String(clients)}
          iconPath={METRIC_ICONS.clientes}
          series={clientSeries}
          sparkColor={IOS.teal}
          trend={thisMonthTrend(clientSeries)}
          note="este mes"
        />
        <MetricCard
          label="Oportunidades"
          value={String(opportunities)}
          iconPath={METRIC_ICONS.pipeline}
          series={oppSeries}
          sparkColor={IOS.orange}
          trend={thisMonthTrend(oppSeries)}
          note="nuevas"
        />
        <MetricCard
          label="Presupuestos del mes"
          value={String(quotesThisMonth)}
          iconPath={METRIC_ICONS.doc}
          series={cotizadoSeries}
          sparkColor={IOS.purple}
          trend={thisMonthTrend(cotizadoSeries)}
          note={`${quotesSent} enviados · ${quotesApproved} aprobados`}
        />
      </div>

      {/* En obra (protagonista) + Rendimiento (anillos) */}
      <div className="grid gap-[14px] lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-[16px] border bg-card p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="mb-4 flex items-center justify-between">
            {/* El título también es un acceso: clic → /obras */}
            <Link
              href="/obras"
              className="text-[13px] font-semibold tracking-[0.04em] text-muted-foreground transition-colors hover:text-primary"
            >
              🏗️ En obra{inExecution > 0 ? ` · ${inExecution}` : ""}
            </Link>
            <Link href="/obras" className="text-xs font-semibold text-primary hover:underline">
              Ver todo →
            </Link>
          </div>
          {obras.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay obras en ejecución. Un presupuesto aprobado pasa acá con
              el botón &quot;Pasar a ejecución&quot;.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {obras.map((o) => {
                // Costos cargados (en la moneda de la obra) vs. presupuestado.
                const cost = o.expenses
                  .filter((e) => e.currency === o.currency)
                  .reduce((sum, e) => sum + Number(e.amount), 0);
                const budget = o.amount ? Number(o.amount) : 0;
                const costPct =
                  budget > 0 ? Math.round((cost / budget) * 100) : null;
                const barColor =
                  costPct === null
                    ? "#8E8E93"
                    : costPct > 100
                      ? "#D65A46"
                      : costPct > 80
                        ? "#E0982C"
                        : "#4FB574";
                const openTasks = openTasksByObra.get(o.id) ?? 0;
                const idleDays = Math.floor(
                  (now - o.updatedAt.getTime()) / 86_400_000
                );
                const symbol = o.currency === "USD" ? "US$" : "$";
                return (
                  <li key={o.id}>
                    <Link
                      href={`/oportunidades/${o.id}`}
                      className="block rounded-[10px] border border-border2 bg-card2 px-4 py-3 transition-colors hover:border-primary/50"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-semibold">
                          {o.title}
                        </p>
                        {budget > 0 && (
                          <span className="shrink-0 text-xs font-semibold tabular-nums">
                            {symbol} {budget.toLocaleString("es-AR")}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {o.client.legalName}
                        {o.siteAddress && ` · ${o.siteAddress}`}
                      </p>
                      {costPct !== null && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-chip">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(costPct, 100)}%`,
                                background: barColor,
                              }}
                            />
                          </div>
                          <span
                            className="shrink-0 text-[11px] font-semibold tabular-nums"
                            style={{ color: barColor }}
                          >
                            {costPct}% del presupuesto en costos
                          </span>
                        </div>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
                        {openTasks > 0 && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
                            {openTasks} tarea{openTasks === 1 ? "" : "s"} abierta
                            {openTasks === 1 ? "" : "s"}
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${
                            idleDays > 7
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                              : "bg-chip text-muted-foreground"
                          }`}
                        >
                          {idleDays === 0
                            ? "con novedades hoy"
                            : `${idleDays} día${idleDays === 1 ? "" : "s"} sin novedades`}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-[16px] border bg-card p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
          <h2 className="mb-4 text-[13px] font-semibold tracking-[0.04em] text-muted-foreground">
            Rendimiento
          </h2>
          <div className="flex items-start justify-around gap-2">
            {rings.map((r) => (
              <ProgressRing key={r.label} pct={r.value} color={r.color} label={r.label} />
            ))}
          </div>
        </section>
      </div>

      {/* Fila 2 */}
      <div className="grid gap-[14px] lg:grid-cols-[1.5fr_1fr]">
        {/* Presupuestos por mes (cotizados vs aprobados) */}
        <section className="rounded-[12px] border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              Presupuestos por mes
            </h2>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: BAR_QUOTED }} />
                Cotizados
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: BAR_APPROVED }} />
                Aprobados
              </span>
            </div>
          </div>
          <div className="flex h-40 items-end gap-3 border-b border-border pb-px">
            {monthLabels.map((label, i) => (
              <div
                key={label + i}
                className="flex h-full flex-1 items-end justify-center gap-[3px]"
              >
                <div
                  className="w-4 rounded-t-[4px]"
                  style={{
                    background: BAR_QUOTED,
                    height: `${(cotizadoSeries[i] / maxBar) * 100}%`,
                    minHeight: cotizadoSeries[i] > 0 ? 3 : 0,
                  }}
                  title={`${cotizadoSeries[i]} cotizado(s)`}
                />
                <div
                  className="w-4 rounded-t-[4px]"
                  style={{
                    background: BAR_APPROVED,
                    height: `${(approvedSeries[i] / maxBar) * 100}%`,
                    minHeight: approvedSeries[i] > 0 ? 3 : 0,
                  }}
                  title={`${approvedSeries[i]} aprobado(s)`}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-3">
            {monthLabels.map((label, i) => (
              <div key={label + i} className="flex-1 text-center text-[11.5px] text-muted2">
                {label}
              </div>
            ))}
          </div>
        </section>

        {/* Requiere atención */}
        <section className="rounded-[12px] border bg-card p-5">
          <h2 className="mb-4 text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
            Requiere atención
          </h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todo al día. Sin pendientes urgentes.
            </p>
          ) : (
            <div className="space-y-2.5">
              {alerts.slice(0, 3).map((alert, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-[10px] border border-border2 bg-card2 p-3"
                >
                  <span
                    className="w-[3px] shrink-0 rounded-full"
                    style={{ background: alert.color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">
                      {alert.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {alert.subtitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Mis tareas (actividades tipo TAREA sin completar) */}
      <section className="rounded-[12px] border bg-card p-5">
        <h2 className="mb-4 text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
          Mis tareas
        </h2>
        {/* Facturas vencidas cargadas por mí: fijadas arriba, en rojo.
            Se resuelven solas al imputarles el pago en la cuenta corriente. */}
        {myOverdueInvoices.length > 0 && (
          <ul className="mb-2 space-y-2">
            {myOverdueInvoices.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-3 rounded-[10px] border border-red-300 bg-red-50 px-3 py-2.5 text-sm dark:border-red-900 dark:bg-red-950/40"
              >
                <span aria-hidden>💰</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    Factura impaga{inv.reference ? ` ${inv.reference}` : ""}:{" "}
                    {inv.legalName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <Link
                      href={`/clientes/${inv.clientId}/cuenta`}
                      className="hover:underline"
                    >
                      {inv.currency === "USD" ? "US$" : "$"}{" "}
                      {Number(inv.remaining).toLocaleString("es-AR")} pendiente
                      · registrá el pago para resolverla →
                    </Link>
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-red-600 dark:text-red-400">
                  {inv.daysLate} día{inv.daysLate === 1 ? "" : "s"} de atraso
                </span>
              </li>
            ))}
          </ul>
        )}
        {myTasks.length === 0 && myOverdueInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin tareas pendientes. Se crean desde la ficha de cada cliente
            (Actividades y tareas).
          </p>
        ) : (
          <ul className="space-y-2">
            {myTasks.map((t) => {
              const overdue = t.dueAt && t.dueAt.getTime() < now;
              const delegatedToMe = t.assignedToId === user.id;
              const delegatedByMe = !!t.assignedToId && !delegatedToMe;
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-[10px] border border-border2 bg-card2 px-3 py-2.5 text-sm"
                >
                  {/* Delegadas: se resuelven en la ficha del cliente (respuesta
                      + confirmación), no con el tilde rápido. */}
                  {t.assignedToId ? (
                    <span
                      title={
                        delegatedToMe
                          ? "Te la delegaron: respondé desde la ficha"
                          : "Esperando la respuesta del asignado"
                      }
                      className="mt-0.5 block h-4 w-4 shrink-0 rounded-full border-2 border-primary/60"
                    />
                  ) : (
                    <form action={toggleActivityDone}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        title="Marcar como completada"
                        className="mt-0.5 block h-4 w-4 rounded border border-zinc-400 hover:bg-emerald-100 dark:border-zinc-500 dark:hover:bg-emerald-900"
                      />
                    </form>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Link
                        href={`/clientes/${t.client.id}`}
                        className="hover:underline"
                      >
                        {t.client.legalName}
                      </Link>
                      {delegatedToMe && (
                        <span className="font-medium text-primary">
                          {" "}
                          · de {t.createdBy.name ?? t.createdBy.email} —
                          respondé y confirmá →
                        </span>
                      )}
                      {delegatedByMe && t.assignedTo && (
                        <span>
                          {" "}
                          · delegada a @{t.assignedTo.name ?? t.assignedTo.email}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      overdue
                        ? "font-semibold text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {t.dueAt
                      ? `${overdue ? "Venció " : "Vence "}${t.dueAt.toLocaleDateString("es-AR")}`
                      : "Sin fecha"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Anillo de progreso (Activity Ring) con centro glass y % real. */
function ProgressRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const c = soft(color);
  const bg = `conic-gradient(from -90deg, ${lighten(color, 30)} 0%, ${c} ${pct}%, var(--chip) ${pct}%, var(--chip) 100%)`;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative"
        style={{ width: 92, height: 92, borderRadius: "50%", background: bg }}
      >
        <div
          className="absolute left-1/2 top-1/2 flex items-center justify-center"
          style={{
            width: 68,
            height: 68,
            transform: "translate(-50%,-50%)",
            borderRadius: "50%",
            background: "var(--glass-hole)",
            border: "1px solid var(--glass-border)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <span className="text-[16px] font-bold tabular-nums">{pct}%</span>
        </div>
      </div>
      <span className="text-[12px] font-medium text-text2">{label}</span>
    </div>
  );
}

import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  clientScope,
  opportunityScope,
  quoteScope,
  canCreateOpportunities,
} from "@/lib/permissions";
import { stageHex } from "@/lib/stage-colors";
import { IOS, monthlyBuckets, lighten, soft } from "@/lib/design";
import { getNotifications } from "@/lib/alerts";
import { QuoteStatus, ClientActivityType } from "@/lib/generated/prisma/enums";
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

export default async function DashboardPage() {
  const user = await requireActiveUser();
  const firstName = (user.name ?? user.email ?? "").split(" ")[0];
  const notifications = await getNotifications(user);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    clients,
    opportunities,
    quotesSent,
    quotesApproved,
    quotesRejected,
    draftClients,
    stages,
    opps,
    myTasks,
    clientDates,
    oppDates,
    quoteRows,
  ] = await Promise.all([
    prisma.client.count({ where: clientScope(user) }),
    prisma.opportunity.count({ where: opportunityScope(user) }),
    prisma.quote.count({
      where: { ...quoteScope(user), status: QuoteStatus.SENT },
    }),
    prisma.quote.count({
      where: { ...quoteScope(user), status: QuoteStatus.APPROVED },
    }),
    prisma.quote.count({
      where: { ...quoteScope(user), status: QuoteStatus.REJECTED },
    }),
    prisma.client.count({ where: { ...clientScope(user), isDraft: true } }),
    prisma.stage.findMany({ orderBy: { position: "asc" } }),
    prisma.opportunity.findMany({
      where: opportunityScope(user),
      select: {
        title: true,
        updatedAt: true,
        stageId: true,
        stage: { select: { name: true } },
        client: { select: { legalName: true } },
      },
    }),
    // Mis tareas abiertas (las creadas por mí), las con vencimiento primero.
    prisma.clientActivity.findMany({
      where: {
        createdById: user.id,
        type: ClientActivityType.TASK,
        doneAt: null,
      },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 6,
      include: { client: { select: { id: true, legalName: true } } },
    }),
    // Series de los últimos 6 meses (para sparklines y barras) — acotadas por fecha.
    prisma.client.findMany({
      where: { ...clientScope(user), createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    }),
    prisma.opportunity.findMany({
      where: { ...opportunityScope(user), createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    }),
    prisma.quote.findMany({
      where: {
        ...quoteScope(user),
        version: 1,
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true, status: true },
    }),
  ]);

  // Series mensuales reales (más viejo → más nuevo).
  const clientSeries = monthlyBuckets(clientDates.map((c) => c.createdAt)).map(
    (b) => b.count
  );
  const oppSeries = monthlyBuckets(oppDates.map((o) => o.createdAt)).map(
    (b) => b.count
  );
  const sentSeries = monthlyBuckets(
    quoteRows
      .filter((q) => q.status === QuoteStatus.SENT)
      .map((q) => q.createdAt)
  ).map((b) => b.count);
  const approvedSeries = monthlyBuckets(
    quoteRows
      .filter((q) => q.status === QuoteStatus.APPROVED)
      .map((q) => q.createdAt)
  ).map((b) => b.count);

  // Barras "Presupuestos por mes": cotizados (todos) vs aprobados.
  const quoteBuckets = monthlyBuckets(quoteRows.map((q) => q.createdAt));
  const cotizadoSeries = quoteBuckets.map((b) => b.count);
  const monthLabels = quoteBuckets.map((b) => b.label);
  const maxBar = Math.max(...cotizadoSeries, 1);

  // Pipeline por etapa
  const countByStage = new Map<string, number>();
  for (const o of opps) {
    countByStage.set(o.stageId, (countByStage.get(o.stageId) ?? 0) + 1);
  }

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
        !["Ganada", "Perdida"].includes(o.stage.name) &&
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

  // Donut: distribución del pipeline (etapas sin "Perdida"), con su color.
  const donutSegments = stages
    .filter((s) => s.name !== "Perdida")
    .map((s) => ({ name: s.name, count: countByStage.get(s.id) ?? 0, hex: stageHex(s.color) }))
    .filter((s) => s.count > 0);
  const donutTotal = donutSegments.reduce((a, s) => a + s.count, 0);

  // Anillos de rendimiento (métricas reales, sin inventar):
  const totalOpps = opps.length;
  const won = opps.filter((o) => o.stage.name === "Ganada").length;
  const active = opps.filter((o) => !["Ganada", "Perdida"].includes(o.stage.name));
  const activeOnTrack = active.filter(
    (o) => now - o.updatedAt.getTime() <= 7 * 86_400_000
  ).length;
  const quotesDecided = quotesApproved + quotesRejected + quotesSent;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const rings = [
    { label: "Ganadas", value: pct(won, totalOpps), color: stageHex("green") },
    { label: "Aprobación", value: pct(quotesApproved, quotesDecided), color: "#E0503A" },
    { label: "Al día", value: pct(activeOnTrack, active.length), color: stageHex("blue") },
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
        </div>
        {canCreateOpportunities(user) && (
          <Link href="/oportunidades/nueva">
            <Button size="cta">+ Nueva oportunidad</Button>
          </Link>
        )}
      </div>

      {/* Métricas (franja accent + ícono + tendencia + sparkline) */}
      <div className="grid grid-cols-2 gap-[14px] lg:grid-cols-4">
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
          label="Presupuestos enviados"
          value={String(quotesSent)}
          iconPath={METRIC_ICONS.doc}
          series={sentSeries}
          sparkColor={IOS.blue}
          note={quotesSent > 0 ? "esperando respuesta" : undefined}
        />
        <MetricCard
          label="Presupuestos aprobados"
          value={String(quotesApproved)}
          iconPath={METRIC_ICONS.check}
          series={approvedSeries}
          sparkColor={IOS.green}
          trend={thisMonthTrend(approvedSeries)}
          note="listos para facturar"
        />
      </div>

      {/* Distribución (donut) + Rendimiento (anillos) */}
      <div className="grid gap-[14px] lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-[16px] border bg-card p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold tracking-[0.04em] text-muted-foreground">
              Distribución del pipeline
            </h2>
            <Link href="/oportunidades" className="text-xs font-semibold text-primary hover:underline">
              Ver todo →
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <PipelineDonut segments={donutSegments} total={donutTotal} />
            <div className="min-w-0 flex-1 space-y-2">
              {donutSegments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin oportunidades activas.</p>
              ) : (
                donutSegments.map((s) => (
                  <div key={s.name} className="flex items-center gap-2.5 text-[13px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.hex }} />
                    <span className="min-w-0 flex-1 truncate text-text2">{s.name}</span>
                    <span className="font-semibold tabular-nums">{s.count}</span>
                    <span className="w-9 text-right text-muted-foreground tabular-nums">
                      {Math.round((s.count / donutTotal) * 100)}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
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
        {myTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin tareas pendientes. Se crean desde la ficha de cada cliente
            (Actividades y tareas).
          </p>
        ) : (
          <ul className="space-y-2">
            {myTasks.map((t) => {
              const overdue = t.dueAt && t.dueAt.getTime() < now;
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-[10px] border border-border2 bg-card2 px-3 py-2.5 text-sm"
                >
                  <form action={toggleActivityDone}>
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      title="Marcar como completada"
                      className="mt-0.5 block h-4 w-4 rounded border border-zinc-400 hover:bg-emerald-100 dark:border-zinc-500 dark:hover:bg-emerald-900"
                    />
                  </form>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Link
                        href={`/clientes/${t.client.id}`}
                        className="hover:underline"
                      >
                        {t.client.legalName}
                      </Link>
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

/** Donut de distribución (conic-gradient) con centro glass. */
function PipelineDonut({
  segments,
  total,
}: {
  segments: { name: string; count: number; hex: string }[];
  total: number;
}) {
  let acc = 0;
  // Degradé sutil por segmento: aclara el arranque y cierra en el color pleno.
  const stops = segments
    .map((s) => {
      const start = (acc / total) * 100;
      acc += s.count;
      const end = (acc / total) * 100;
      return `${lighten(s.hex, 26)} ${start.toFixed(1)}%, ${s.hex} ${end.toFixed(1)}%`;
    })
    .join(", ");
  const bg = total > 0 ? `conic-gradient(from -90deg, ${stops})` : "var(--chip)";
  return (
    <div
      className="relative shrink-0"
      style={{ width: 156, height: 156, borderRadius: "50%", background: bg, boxShadow: "var(--shadow-sm)" }}
    >
      {/* Sombra interior muy leve (sin glow) */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: "inset 0 -6px 12px rgba(0,0,0,0.08)" }}
      />
      <div
        className="absolute left-1/2 top-1/2 flex flex-col items-center justify-center"
        style={{
          width: 104,
          height: 104,
          transform: "translate(-50%,-50%)",
          borderRadius: "50%",
          background: "var(--glass-hole)",
          border: "1px solid var(--glass-border)",
          boxShadow: "0 3px 10px rgba(0,0,0,0.12)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <span className="text-[26px] font-bold leading-none tabular-nums">{total}</span>
        <span className="mt-1 text-[11px] text-muted-foreground">
          activa{total === 1 ? "" : "s"}
        </span>
      </div>
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

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
import { QuoteStatus } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/kpi-card";

type Alert = { color: string; title: string; subtitle: string };

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

  const [
    clients,
    opportunities,
    quotesSent,
    quotesApproved,
    quotesRejected,
    stages,
    opps,
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
  ]);

  // Pipeline por etapa
  const countByStage = new Map<string, number>();
  for (const o of opps) {
    countByStage.set(o.stageId, (countByStage.get(o.stageId) ?? 0) + 1);
  }
  const maxStageCount = Math.max(...[...countByStage.values()], 1);

  // Requiere atención (hasta 3)
  const alerts: Alert[] = [];
  const now = Date.now();
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
          <h1 className="mt-1 text-[30px] font-semibold leading-tight">
            Hola, {firstName}
          </h1>
        </div>
        {canCreateOpportunities(user) && (
          <Link href="/oportunidades/nueva">
            <Button size="cta">+ Nueva oportunidad</Button>
          </Link>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-[14px] lg:grid-cols-4">
        <KpiCard label="Clientes" value={String(clients)} />
        <KpiCard label="Oportunidades" value={String(opportunities)} />
        <KpiCard
          label="Presupuestos enviados"
          value={String(quotesSent)}
          note={quotesSent > 0 ? "esperando respuesta" : undefined}
          noteClassName="text-[#A5721E] dark:text-[#E0B45E]"
        />
        <KpiCard
          label="Presupuestos aprobados"
          value={String(quotesApproved)}
          note={quotesApproved > 0 ? "listos para facturar" : undefined}
          noteClassName="text-[#2E7D54] dark:text-[#7CC8A2]"
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
        {/* Pipeline por etapa */}
        <section className="rounded-[12px] border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              Pipeline por etapa
            </h2>
            <Link
              href="/oportunidades"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Ver pipeline →
            </Link>
          </div>
          <div className="space-y-3">
            {stages
              .filter((s) => s.name !== "Perdida")
              .map((stage) => {
                const count = countByStage.get(stage.id) ?? 0;
                const hex = stageHex(stage.color);
                return (
                  <div key={stage.id} className="flex items-center gap-3">
                    <span
                      className="h-[6px] w-[6px] shrink-0 rounded-[2px]"
                      style={{ background: hex }}
                    />
                    <span className="w-40 shrink-0 truncate text-[13px] text-text2">
                      {stage.name}
                    </span>
                    <div className="h-2 flex-1 rounded-[4px] bg-chip">
                      <div
                        className="h-2 rounded-[4px]"
                        style={{
                          background: hex,
                          width: `${Math.max((count / maxStageCount) * 100, count > 0 ? 4 : 0)}%`,
                        }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-[13px] font-semibold tabular-nums">
                      {count}
                    </span>
                  </div>
                );
              })}
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
  const stops = segments
    .map((s) => {
      const start = (acc / total) * 360;
      acc += s.count;
      const end = (acc / total) * 360;
      return `${s.hex} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
    })
    .join(", ");
  const bg = total > 0 ? `conic-gradient(from -90deg, ${stops})` : "var(--chip)";
  return (
    <div
      className="relative shrink-0"
      style={{ width: 156, height: 156, borderRadius: "50%", background: bg, boxShadow: "var(--shadow-sm)" }}
    >
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
  const bg = `conic-gradient(from -90deg, ${color} 0% ${pct}%, var(--chip) ${pct}% 100%)`;
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
          }}
        >
          <span className="text-[16px] font-bold tabular-nums">{pct}%</span>
        </div>
      </div>
      <span className="text-[12px] font-medium text-text2">{label}</span>
    </div>
  );
}

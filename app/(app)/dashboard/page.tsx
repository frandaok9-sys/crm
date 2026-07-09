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

  const [clients, opportunities, quotesSent, quotesApproved, stages, opps] =
    await Promise.all([
      prisma.client.count({ where: clientScope(user) }),
      prisma.opportunity.count({ where: opportunityScope(user) }),
      prisma.quote.count({
        where: { ...quoteScope(user), status: QuoteStatus.SENT },
      }),
      prisma.quote.count({
        where: { ...quoteScope(user), status: QuoteStatus.APPROVED },
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

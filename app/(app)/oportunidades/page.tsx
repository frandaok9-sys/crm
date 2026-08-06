import Link from "next/link";
import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  opportunityScope,
  canCreateOpportunities,
  canViewAllRecords,
} from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { stageHex } from "@/lib/stage-colors";
import { sellerColor } from "@/components/initials-avatar";
import { Button } from "@/components/ui/button";
import { PipelineBoard, type BoardColumn } from "@/components/pipeline-board";

function compactTotals(byCurrency: Map<string, Decimal>): string | null {
  const parts = [...byCurrency.entries()].map(([currency, total]) => {
    const symbol = currency === "USD" ? "US$" : "$";
    return `${symbol} ${new Intl.NumberFormat("es-AR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(total.toNumber())}`;
  });
  return parts.length ? parts.join(" · ") : null;
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const user = await requireActiveUser();
  const canEdit = canCreateOpportunities(user);
  // Filtro por vendedor: SOLO para quien ve toda la cartera (admin/gerente).
  // Un vendedor común ya ve únicamente lo suyo, no necesita filtro.
  const canFilter = canViewAllRecords(user);

  // Vendedores con oportunidades (para armar los chips con su conteo).
  const sellerGroups = canFilter
    ? await prisma.opportunity.groupBy({
        by: ["ownerId"],
        where: opportunityScope(user),
        _count: { _all: true },
      })
    : [];
  const sellerIds = sellerGroups
    .map((g) => g.ownerId)
    .filter((x): x is string => !!x);
  const sellers = sellerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: sellerIds } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];
  const unassignedCount =
    sellerGroups.find((g) => g.ownerId === null)?._count._all ?? 0;

  // Solo se aplica un filtro válido (un vendedor real o "sin asignar").
  const filter =
    canFilter && v && (v === "none" || sellers.some((s) => s.id === v))
      ? v
      : null;

  const [stages, opportunities] = await Promise.all([
    prisma.stage.findMany({ orderBy: { position: "asc" } }),
    prisma.opportunity.findMany({
      where: {
        ...opportunityScope(user),
        ...(filter ? { ownerId: filter === "none" ? null : filter } : {}),
      },
      include: {
        client: { select: { legalName: true } },
        owner: { select: { name: true, email: true } },
      },
      orderBy: { position: "asc" },
    }),
  ]);

  const columns: BoardColumn[] = stages.map((stage) => {
    const inStage = opportunities.filter((o) => o.stageId === stage.id);
    const totals = new Map<string, Decimal>();
    for (const o of inStage) {
      if (!o.amount) continue;
      totals.set(
        o.currency,
        (totals.get(o.currency) ?? new Decimal(0)).plus(o.amount.toString())
      );
    }
    return {
      id: stage.id,
      name: stage.name,
      hex: stageHex(stage.color),
      totalLabel: compactTotals(totals),
      opportunities: inStage.map((o) => {
        const ownerName = o.owner ? o.owner.name ?? o.owner.email : null;
        return {
          id: o.id,
          title: o.title,
          clientName: o.client.legalName,
          amountLabel: formatMoney(
            o.amount ? o.amount.toString() : null,
            o.currency
          ),
          m2Label: o.estimatedM2
            ? `${Number(o.estimatedM2).toLocaleString("es-AR")} m²`
            : null,
          ownerName,
          ownerTint: ownerName ? sellerColor(ownerName) : null,
          isPinned: o.isPinned,
        };
      }),
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {opportunities.length} oportunidad(es) activas
            {canEdit && " · arrastrá las tarjetas entre etapas"}.
          </p>
        </div>
        {canEdit && (
          <Link href="/oportunidades/nueva">
            <Button size="cta">+ Nueva oportunidad</Button>
          </Link>
        )}
      </div>

      {/* Filtro por vendedor (solo para quien ve toda la cartera) */}
      {canFilter && (sellers.length > 0 || unassignedCount > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Vendedor
          </span>
          <Link
            href="/oportunidades"
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !filter
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-hoverbg"
            }`}
          >
            Todos
          </Link>
          {sellers.map((s) => {
            const count =
              sellerGroups.find((g) => g.ownerId === s.id)?._count._all ?? 0;
            const name = s.name ?? s.email;
            return (
              <Link
                key={s.id}
                href={`/oportunidades?v=${s.id}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === s.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-hoverbg"
                }`}
              >
                {name} · {count}
              </Link>
            );
          })}
          {unassignedCount > 0 && (
            <Link
              href="/oportunidades?v=none"
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === "none"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-hoverbg"
              }`}
            >
              Sin asignar · {unassignedCount}
            </Link>
          )}
        </div>
      )}

      <PipelineBoard columns={columns} canEdit={canEdit} />
    </div>
  );
}

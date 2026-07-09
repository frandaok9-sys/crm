import Link from "next/link";
import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { opportunityScope, canCreateOpportunities } from "@/lib/permissions";
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

export default async function OpportunitiesPage() {
  const user = await requireActiveUser();
  const canEdit = canCreateOpportunities(user);

  const [stages, opportunities] = await Promise.all([
    prisma.stage.findMany({ orderBy: { position: "asc" } }),
    prisma.opportunity.findMany({
      where: opportunityScope(user),
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

      <PipelineBoard columns={columns} canEdit={canEdit} />
    </div>
  );
}

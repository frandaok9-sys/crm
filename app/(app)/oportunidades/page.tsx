import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { opportunityScope, canCreateOpportunities } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { Button } from "@/components/ui/button";
import {
  PipelineBoard,
  type BoardColumn,
} from "@/components/pipeline-board";

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

  const columns: BoardColumn[] = stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    color: stage.color,
    opportunities: opportunities
      .filter((o) => o.stageId === stage.id)
      .map((o) => ({
        id: o.id,
        title: o.title,
        clientName: o.client.legalName,
        amountLabel: formatMoney(o.amount ? o.amount.toString() : null, o.currency),
        ownerName: o.owner ? o.owner.name ?? o.owner.email : null,
        isPinned: o.isPinned,
      })),
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {opportunities.length} oportunidad(es).
            {canEdit && " Arrastrá las tarjetas entre etapas."}
          </p>
        </div>
        {canEdit && (
          <Link href="/oportunidades/nueva">
            <Button>Nueva oportunidad</Button>
          </Link>
        )}
      </div>

      <PipelineBoard columns={columns} canEdit={canEdit} />
    </div>
  );
}

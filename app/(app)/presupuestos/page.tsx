import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  quoteScope,
  canViewAllRecords,
  canCreateQuotes,
} from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { QUOTE_STATUS_LABELS, latestRevisions } from "@/lib/quotes";
import { QuoteStatus } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { TintBadge, type TintVariant } from "@/components/tint-badge";
import { InitialsAvatar } from "@/components/initials-avatar";

const GRID = "grid grid-cols-[1.6fr_2fr_1.1fr_1.3fr_1fr_1.3fr] items-center";

const STATUS_VARIANT: Record<QuoteStatus, TintVariant> = {
  [QuoteStatus.DRAFT]: "gray",
  [QuoteStatus.SENT]: "blue",
  [QuoteStatus.APPROVED]: "green",
  [QuoteStatus.REJECTED]: "red",
  [QuoteStatus.EXPIRED]: "amber",
};

export default async function QuotesPage() {
  const user = await requireActiveUser();
  const showOwner = canViewAllRecords(user);
  const canCreate = canCreateQuotes(user);

  const allQuotes = await prisma.quote.findMany({
    where: quoteScope(user),
    include: {
      client: { select: { legalName: true } },
      owner: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Una fila por presupuesto (su última revisión).
  const revisionCount = new Map<string, number>();
  for (const quote of allQuotes) {
    const group = quote.rootId ?? quote.id;
    revisionCount.set(group, (revisionCount.get(group) ?? 0) + 1);
  }
  const quotes = latestRevisions(allQuotes).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">
            Presupuestos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {quotes.length} presupuesto(s).
          </p>
        </div>
        {canCreate && (
          <Link href="/presupuestos/nuevo">
            <Button size="cta">+ Nuevo presupuesto</Button>
          </Link>
        )}
      </div>

      <section className="overflow-hidden rounded-[12px] border bg-card">
        <div
          className={`${GRID} border-b border-border2 bg-card2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground`}
        >
          <span>Número</span>
          <span>Cliente</span>
          <span>Estado</span>
          <span className="text-right">Total</span>
          <span>Fecha</span>
          <span>Vendedor</span>
        </div>

        {quotes.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Todavía no hay presupuestos.
          </div>
        ) : (
          quotes.map((quote) => {
            const versions = revisionCount.get(quote.rootId ?? quote.id) ?? 1;
            const ownerName = quote.owner
              ? quote.owner.name ?? quote.owner.email
              : null;
            return (
              <div
                key={quote.id}
                className={`${GRID} border-b border-border2 px-5 py-[14px] text-[13px] transition-colors last:border-0 hover:bg-hoverbg`}
              >
                <span className="min-w-0 pr-3">
                  <Link
                    href={`/presupuestos/${quote.id}`}
                    className="block text-[13.5px] font-bold text-foreground hover:underline"
                  >
                    {quote.code}
                  </Link>
                  {quote.version > 1 && (
                    <span className="block text-[11px] text-muted-foreground">
                      Rev. {quote.version} · {versions} versiones
                    </span>
                  )}
                </span>
                <span className="truncate pr-3 text-text2">
                  {quote.client.legalName}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <TintBadge variant={STATUS_VARIANT[quote.status]}>
                    {QUOTE_STATUS_LABELS[quote.status]}
                  </TintBadge>
                  {quote.needsReview && (
                    <Link
                      href={`/presupuestos/${quote.id}/editar`}
                      title="Creado por el asistente — revisá precios y envialo"
                      className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary hover:bg-primary/20"
                    >
                      Por completar
                    </Link>
                  )}
                </span>
                <span className="text-right font-bold tabular-nums">
                  {formatMoney(quote.total.toString(), quote.currency)}
                </span>
                <span className="pl-4 tabular-nums text-muted-foreground">
                  {quote.createdAt.toLocaleDateString("es-AR")}
                </span>
                <span className="flex min-w-0 items-center gap-2 pl-2">
                  {ownerName ? (
                    <>
                      <InitialsAvatar name={ownerName} size={22} />
                      <span className="truncate text-text2">{ownerName}</span>
                    </>
                  ) : (
                    <span className="text-muted2">—</span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

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
import {
  QuoteStatus,
  LedgerMovementType,
} from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { TintBadge, type TintVariant } from "@/components/tint-badge";
import { InitialsAvatar } from "@/components/initials-avatar";
import { formatDateAR } from "@/lib/dates";
import { formatInvoiceNumber } from "@/lib/invoices";

// Total y Fecha van con ancho AUTOMÁTICO (max-content): con fracciones
// fijas, un importe largo ($ 129.711.941,41) desbordaba su columna y
// quedaba pegado a la fecha, comiéndose el gap.
const GRID =
  "grid grid-cols-[1.4fr_1.8fr_1.1fr_max-content_max-content_1.2fr] items-center gap-x-6";

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

  // Una fila por presupuesto: su última revisión (el detalle muestra
  // cuántas tuvo).

  // Facturado = existe el movimiento de factura (no es un estado del
  // presupuesto). Se busca por GRUPO: la factura puede estar en cualquier
  // revisión. Ver lib/invoices.ts.
  const invoices = await prisma.ledgerMovement.findMany({
    where: {
      type: LedgerMovementType.INVOICE,
      quoteId: { in: allQuotes.map((q) => q.id) },
    },
    select: {
      quoteId: true,
      date: true,
      reference: true,
      cbteTipo: true,
      ptoVta: true,
      cbteNro: true,
    },
  });
  const groupOf = new Map(allQuotes.map((q) => [q.id, q.rootId ?? q.id]));
  const codeOf = new Map(allQuotes.map((q) => [q.id, q.code]));
  const invoiceByGroup = new Map<
    string,
    { number: string | null; date: Date }
  >();
  for (const inv of invoices) {
    const group = inv.quoteId ? groupOf.get(inv.quoteId) : null;
    if (!group) continue;
    invoiceByGroup.set(group, {
      // Sin comprobante real cargado, number queda null: se muestra el
      // código del presupuesto y el cartel "Facturado".
      number: formatInvoiceNumber(
        inv,
        inv.quoteId ? codeOf.get(inv.quoteId) : null
      ),
      date: inv.date,
    });
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
            const group = quote.rootId ?? quote.id;
            const ownerName = quote.owner
              ? quote.owner.name ?? quote.owner.email
              : null;
            // Facturado: el identificador principal pasa a ser el número de
            // factura y el PRE-XXXX baja a la línea de abajo (trazabilidad).
            const invoice = invoiceByGroup.get(group);
            return (
              <div
                key={quote.id}
                className={`${GRID} border-b border-border2 px-5 py-[14px] text-[13px] transition-colors last:border-0 hover:bg-hoverbg`}
              >
                {/* Vista general: solo el identificador. Las revisiones se
                    ven al entrar al presupuesto. */}
                <span className="min-w-0">
                  <Link
                    href={`/presupuestos/${quote.id}`}
                    className="block truncate text-[13.5px] font-bold text-foreground hover:underline"
                  >
                    {invoice?.number ?? quote.code}
                  </Link>
                  {invoice?.number && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {quote.code}
                    </span>
                  )}
                </span>
                <span className="truncate text-text2">
                  {quote.client.legalName}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {/* UN solo estado: facturado es el final del circuito y
                      reemplaza al estado comercial. */}
                  {invoice ? (
                    <TintBadge variant="green">Facturado</TintBadge>
                  ) : (
                    <TintBadge variant={STATUS_VARIANT[quote.status]}>
                      {QUOTE_STATUS_LABELS[quote.status]}
                    </TintBadge>
                  )}
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
                <span className="tabular-nums text-muted-foreground">
                  {formatDateAR(quote.createdAt)}
                </span>
                <span className="flex min-w-0 items-center gap-2">
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

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canViewRecord, canEditQuote } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { computeQuoteTotals } from "@/lib/quotes-calc";
import {
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_STYLES,
  ITEM_TYPE_LABELS,
} from "@/lib/quotes";
import { QuoteStatus } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { setQuoteStatus, reviseQuote } from "../actions";

function StatusButton({
  id,
  status,
  label,
}: {
  id: string;
  status: QuoteStatus;
  label: string;
}) {
  return (
    <form action={setQuoteStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant="outline">
        {label}
      </Button>
    </form>
  );
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireActiveUser();

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, legalName: true } },
      owner: { select: { name: true, email: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!quote) notFound();
  if (!canViewRecord(user, quote)) redirect("/presupuestos");

  const canEdit = canEditQuote(user, quote);
  const currency = quote.currency;
  const fmt = (value: string) => formatMoney(value, currency);

  const totals = computeQuoteTotals(
    quote.items.map((it) => ({
      quantity: it.quantity.toString(),
      unitPrice: it.unitPrice.toString(),
      ivaRate: it.ivaRate.toString(),
    }))
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/presupuestos"
            className="text-sm text-zinc-500 hover:underline"
          >
            ← Volver a presupuestos
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {quote.code}
            {quote.version > 1 && (
              <span className="text-base font-normal text-zinc-400">
                Rev.{quote.version}
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${QUOTE_STATUS_STYLES[quote.status]}`}
            >
              {QUOTE_STATUS_LABELS[quote.status]}
            </span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            <Link
              href={`/clientes/${quote.client.id}`}
              className="hover:underline"
            >
              {quote.client.legalName}
            </Link>{" "}
            · {quote.createdAt.toLocaleDateString("es-AR")}
            {quote.validUntil && (
              <> · vence {quote.validUntil.toLocaleDateString("es-AR")}</>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled
          title="Disponible próximamente"
        >
          Descargar PDF (próximamente)
        </Button>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {quote.status === QuoteStatus.DRAFT && (
            <>
              <Link href={`/presupuestos/${quote.id}/editar`}>
                <Button size="sm">Editar</Button>
              </Link>
              <StatusButton
                id={quote.id}
                status={QuoteStatus.SENT}
                label="Marcar como enviado"
              />
            </>
          )}
          {quote.status === QuoteStatus.SENT && (
            <>
              <StatusButton
                id={quote.id}
                status={QuoteStatus.APPROVED}
                label="Aprobar"
              />
              <StatusButton
                id={quote.id}
                status={QuoteStatus.REJECTED}
                label="Rechazar"
              />
              <StatusButton
                id={quote.id}
                status={QuoteStatus.EXPIRED}
                label="Marcar vencido"
              />
            </>
          )}
          <form action={reviseQuote}>
            <input type="hidden" name="id" value={quote.id} />
            <Button type="submit" size="sm" variant="ghost">
              Nueva revisión
            </Button>
          </form>
        </div>
      )}

      <section className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3 font-medium">Detalle</th>
              <th className="px-4 py-3 text-right font-medium">Cant.</th>
              <th className="px-4 py-3 text-right font-medium">P. unit.</th>
              <th className="px-4 py-3 text-right font-medium">IVA</th>
              <th className="px-4 py-3 text-right font-medium">Neto</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div>{item.description}</div>
                  <div className="text-xs text-zinc-400">
                    {ITEM_TYPE_LABELS[item.type]}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  {item.quantity.toString()}{" "}
                  <span className="text-zinc-400">{item.unit}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {fmt(item.unitPrice.toString())}
                </td>
                <td className="px-4 py-3 text-right">
                  {item.ivaRate.toString()}%
                </td>
                <td className="px-4 py-3 text-right">
                  {fmt(item.lineNet.toString())}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="flex justify-end">
        <div className="w-72 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Neto</span>
            <span>{fmt(totals.net)}</span>
          </div>
          {totals.ivaBreakdown.map((iva) => (
            <div key={iva.rate} className="flex justify-between text-zinc-500">
              <span>IVA {iva.rate}%</span>
              <span>{fmt(iva.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-1 text-base font-semibold">
            <span>Total</span>
            <span>{fmt(totals.total)}</span>
          </div>
        </div>
      </div>

      {quote.notes && (
        <section className="rounded-xl border bg-white p-4 text-sm dark:bg-zinc-900">
          <h2 className="mb-1 text-xs font-medium uppercase text-zinc-500">
            Notas / condiciones
          </h2>
          <p className="whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
            {quote.notes}
          </p>
        </section>
      )}
    </div>
  );
}

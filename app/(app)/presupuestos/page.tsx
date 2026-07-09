import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  quoteScope,
  canViewAllRecords,
  canCreateQuotes,
} from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES } from "@/lib/quotes";
import { Button } from "@/components/ui/button";

export default async function QuotesPage() {
  const user = await requireActiveUser();
  const showOwner = canViewAllRecords(user);
  const canCreate = canCreateQuotes(user);

  const quotes = await prisma.quote.findMany({
    where: quoteScope(user),
    include: {
      client: { select: { legalName: true } },
      owner: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Presupuestos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {quotes.length} presupuesto(s).
          </p>
        </div>
        {canCreate && (
          <Link href="/presupuestos/nuevo">
            <Button>Nuevo presupuesto</Button>
          </Link>
        )}
      </div>

      {quotes.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-zinc-500 dark:bg-zinc-950">
          Todavía no hay presupuestos.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-950">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                {showOwner && <th className="px-4 py-3 font-medium">Vendedor</th>}
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/presupuestos/${quote.id}`}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {quote.code}
                    </Link>
                    {quote.version > 1 && (
                      <span className="ml-1 text-xs text-zinc-400">
                        Rev.{quote.version}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{quote.client.legalName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${QUOTE_STATUS_STYLES[quote.status]}`}
                    >
                      {QUOTE_STATUS_LABELS[quote.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {formatMoney(quote.total.toString(), quote.currency)}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {quote.createdAt.toLocaleDateString("es-AR")}
                  </td>
                  {showOwner && (
                    <td className="px-4 py-3">
                      {quote.owner
                        ? quote.owner.name ?? quote.owner.email
                        : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

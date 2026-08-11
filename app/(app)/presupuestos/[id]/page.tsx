import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canViewRecord,
  canEditQuote,
  canManageLedger,
  canPostTasks,
} from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { computeQuoteTotals } from "@/lib/quotes-calc";
import {
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_STYLES,
  ITEM_TYPE_LABELS,
} from "@/lib/quotes";
import {
  QuoteStatus,
  LedgerMovementType,
  UserStatus,
} from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { TaskThread } from "@/components/task-thread";
import { DeleteQuoteButton } from "@/components/delete-quote-button";
import { EXECUTION_STAGE } from "@/lib/stages";
import {
  setQuoteStatus,
  reviseQuote,
  invoiceQuote,
  addQuoteTask,
  startQuoteExecution,
} from "../actions";
import { formatDateAR } from "@/lib/dates";

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
      <SubmitButton size="sm" variant="outline" pendingText="Guardando…">
        {label}
      </SubmitButton>
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
      // La obra vinculada con su etapa real: el cartel no puede decir
      // "en ejecución" cuando la obra ya está finalizada o perdida.
      obra: { select: { id: true, stage: { select: { name: true } } } },
      photos: {
        orderBy: { position: "asc" },
        select: { id: true, data: true, caption: true, section: true },
      },
    },
  });
  if (!quote) notFound();
  if (!canViewRecord(user, quote)) redirect("/presupuestos");

  // Chat de tareas del presupuesto + compañeros para delegar.
  const [tasks, activeUsers] = await Promise.all([
    prisma.clientActivity.findMany({
      where: { quoteId: id },
      select: {
        id: true,
        title: true,
        priority: true,
        doneAt: true,
        reply: true,
        createdAt: true,
        createdById: true,
        assignedToId: true,
        createdBy: { select: { name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: { status: UserStatus.ACTIVE },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const teammates = activeUsers
    .filter((u) => u.id !== user.id)
    .map((u) => ({ id: u.id, label: u.name ?? u.email }));

  // Eliminar: se borra el grupo COMPLETO de revisiones; si alguna fue
  // facturada a la cuenta corriente, el borrado se frena (regla contable).
  const group = quote.rootId ?? quote.id;
  const groupRevisions = await prisma.quote.findMany({
    where: { OR: [{ id: group }, { rootId: group }] },
    select: { id: true },
  });
  const invoicedCount = await prisma.ledgerMovement.count({
    where: { quoteId: { in: groupRevisions.map((r) => r.id) } },
  });

  const canEdit = canEditQuote(user, quote);
  const canInvoice = canManageLedger(user);
  const invoice =
    quote.status === QuoteStatus.APPROVED || quote.status === QuoteStatus.SENT
      ? await prisma.ledgerMovement.findFirst({
          where: { quoteId: id, type: LedgerMovementType.INVOICE },
          select: { id: true, date: true },
        })
      : null;
  const currency = quote.currency;
  const fmt = (value: string) => formatMoney(value, currency);

  const totals = computeQuoteTotals(
    quote.items.map((it) => ({
      quantity: it.quantity.toString(),
      unitPrice: it.unitPrice.toString(),
      discount: it.discount.toString(),
      ivaRate: it.ivaRate.toString(),
    })),
    quote.overallDiscount.toString()
  );
  const hasDiscounts = quote.items.some((it) => Number(it.discount) > 0);
  const hasOverallDiscount = Number(totals.overallDiscountAmount) > 0;

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
            · {formatDateAR(quote.createdAt)}
            {quote.validUntil && (
              <> · vence {formatDateAR(quote.validUntil)}</>
            )}
            {quote.paymentTerms && <> · pago: {quote.paymentTerms}</>}
          </p>
        </div>
        <a
          href={`/presupuestos/${quote.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" size="sm">
            Descargar PDF
          </Button>
        </a>
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
            <SubmitButton size="sm" variant="ghost" pendingText="Creando revisión…">
              Nueva revisión
            </SubmitButton>
          </form>
        </div>
      )}

      {/* Obra: pasar a ejecución (aprobado → oportunidad "En ejecución") */}
      {quote.status === QuoteStatus.APPROVED && (
        <div className="flex flex-wrap items-center gap-3">
          {quote.obra ? (
            <>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                  quote.obra.stage.name === EXECUTION_STAGE
                    ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                🏗️ Obra: {quote.obra.stage.name}
              </span>
              <Link
                href={`/oportunidades/${quote.obra.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Ver obra →
              </Link>
            </>
          ) : (
            canEdit && (
              <form action={startQuoteExecution}>
                <input type="hidden" name="id" value={quote.id} />
                <SubmitButton size="sm" pendingText="Creando obra…">
                  🏗️ Pasar a ejecución
                </SubmitButton>
              </form>
            )
          )}
        </div>
      )}

      {/* Facturación a cuenta corriente (roles financieros) */}
      {quote.status === QuoteStatus.APPROVED && (
        <div className="flex flex-wrap items-center gap-3">
          {invoice ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                ✓ Facturado el {formatDateAR(invoice.date)}
              </span>
              <Link
                href={`/clientes/${quote.client.id}/cuenta`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Ver cuenta corriente →
              </Link>
            </>
          ) : canInvoice ? (
            <form action={invoiceQuote} className="flex items-center gap-2">
              <input type="hidden" name="id" value={quote.id} />
              <select
                name="termDays"
                defaultValue="0"
                aria-label="Condición de pago"
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="0">Contado</option>
                <option value="10">10 días</option>
                <option value="15">15 días</option>
                <option value="30">30 días</option>
                <option value="45">45 días</option>
              </select>
              <SubmitButton size="sm" pendingText="Facturando…">
                Facturar a cuenta corriente
              </SubmitButton>
            </form>
          ) : (
            <span className="text-xs text-zinc-500">
              Pendiente de facturación (la registra Administración).
            </span>
          )}
        </div>
      )}

      <section className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3 font-medium">Detalle</th>
              <th className="px-4 py-3 text-right font-medium">Cant.</th>
              <th className="px-4 py-3 text-right font-medium">P. unit.</th>
              {hasDiscounts && (
                <th className="px-4 py-3 text-right font-medium">Desc.</th>
              )}
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
                {hasDiscounts && (
                  <td className="px-4 py-3 text-right">
                    {Number(item.discount) > 0
                      ? `${Number(item.discount)}%`
                      : "—"}
                  </td>
                )}
                <td className="px-4 py-3 text-right">
                  {Number(item.ivaRate)}%
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
          {hasOverallDiscount ? (
            <>
              <div className="flex justify-between">
                <span className="text-zinc-500">Subtotal</span>
                <span>{fmt(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>
                  Descuento general {Number(totals.overallDiscountPct)}%
                </span>
                <span>−{fmt(totals.overallDiscountAmount)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-zinc-500">Neto</span>
                <span>{fmt(totals.net)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-zinc-500">Neto</span>
              <span>{fmt(totals.net)}</span>
            </div>
          )}
          {totals.ivaBreakdown.map((iva) => (
            <div key={iva.rate} className="flex justify-between text-zinc-500">
              <span>IVA {Number(iva.rate)}%</span>
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

      {/* Pliego técnico (solo las secciones cargadas) */}
      {(quote.siteTitle ||
        quote.siteAddress ||
        quote.scopeText ||
        quote.taskDescription ||
        quote.exclusions ||
        quote.deliveryTerm ||
        quote.warrantyText ||
        quote.generalConditions ||
        quote.photos.length > 0) && (
        <section className="rounded-xl border bg-white p-6 text-sm dark:bg-zinc-900">
          <h2 className="mb-4 text-xs font-medium uppercase text-zinc-500">
            Informe técnico
          </h2>
          {(quote.siteTitle || quote.siteAddress) && (
            <div className="mb-4 rounded-lg border-l-4 border-zinc-800 bg-zinc-50 p-3 dark:border-zinc-500 dark:bg-zinc-800/60">
              {quote.siteTitle && (
                <p className="font-semibold uppercase">{quote.siteTitle}</p>
              )}
              {quote.siteAddress && (
                <p className="text-zinc-500">{quote.siteAddress}</p>
              )}
            </div>
          )}
          <div className="space-y-4">
            {(
              [
                ["scope", "Alcance del suministro o servicio", quote.scopeText],
                ["tasks", "Descripción de tareas", quote.taskDescription],
                ["exclusions", "Exclusiones del alcance", quote.exclusions],
                ["delivery", "Plazo de entrega", quote.deliveryTerm],
                ["warranty", "Garantía", quote.warrantyText],
                ["conditions", "Condiciones generales", quote.generalConditions],
                ["general", "Fotos de la propuesta", null],
              ] as [string, string, string | null][]
            )
              .map(([key, title, body]) => {
                const sectionPhotos = quote.photos.filter(
                  (p) => (p.section ?? "general") === key
                );
                if (!body && sectionPhotos.length === 0) return null;
                return (
                  <div key={key}>
                    {/* Sin números acá: el PDF numera distinto (intercala
                        "Precio" y "Mantenimiento de la oferta") y hablar de
                        "el punto 6" con un cliente debe referir al PDF. */}
                    <h3 className="mb-1 border-b pb-1 text-xs font-bold uppercase tracking-wide dark:border-zinc-700">
                      <span className="text-primary">§ </span>
                      {title}
                    </h3>
                    {body && (
                      <p className="whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
                        {body}
                      </p>
                    )}
                    {sectionPhotos.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {sectionPhotos.map((p) => (
                          <figure key={p.id}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p.data}
                              alt={p.caption ?? "Foto de la propuesta"}
                              className="h-32 w-full rounded-lg border object-cover dark:border-zinc-700"
                            />
                            {p.caption && (
                              <figcaption className="mt-1 text-[11px] text-zinc-500">
                                {p.caption}
                              </figcaption>
                            )}
                          </figure>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
              .filter(Boolean)}
          </div>
        </section>
      )}

      <TaskThread
        action={addQuoteTask}
        hiddenName="quoteId"
        hiddenValue={quote.id}
        tasks={tasks}
        teammates={teammates}
        currentUserId={user.id}
        canPost={canPostTasks(user)}
      />

      {/* Zona de riesgo: eliminar el presupuesto (abajo de todo) */}
      {canEdit && (
        <section className="rounded-xl border border-red-200 bg-white p-6 dark:border-red-950 dark:bg-zinc-900">
          <h2 className="mb-1 text-sm font-medium text-red-600 dark:text-red-400">
            Eliminar presupuesto
          </h2>
          <p className="mb-4 text-xs text-zinc-500">
            {invoicedCount > 0
              ? "Este presupuesto está facturado en la cuenta corriente: no se puede eliminar (los registros contables se conservan)."
              : "Borra el presupuesto definitivamente, con todas sus revisiones, ítems, fotos y tareas. No se puede deshacer."}
          </p>
          {invoicedCount === 0 && (
            <DeleteQuoteButton
              quoteId={quote.id}
              code={quote.code}
              revisionCount={groupRevisions.length}
              taskCount={tasks.length}
            />
          )}
        </section>
      )}
    </div>
  );
}

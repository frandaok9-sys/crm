import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canEditQuote,
  canAssignClients,
  clientScope,
} from "@/lib/permissions";
import { UserStatus, QuoteStatus } from "@/lib/generated/prisma/enums";
import { getCatalogProducts } from "@/lib/products";
import { QuoteForm } from "@/components/quote-form";
import { updateQuote } from "../../actions";

export default async function EditQuotePage({
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
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!quote) notFound();
  if (!canEditQuote(user, quote)) redirect("/presupuestos");
  if (quote.status !== QuoteStatus.DRAFT) redirect(`/presupuestos/${id}`);

  const canAssign = canAssignClients(user);
  const [clients, taxRates, owners] = await Promise.all([
    prisma.client.findMany({
      where: clientScope(user),
      select: { id: true, legalName: true },
      orderBy: { legalName: "asc" },
    }),
    prisma.taxRate.findMany({ orderBy: { position: "asc" } }),
    canAssign
      ? prisma.user.findMany({
          where: { status: UserStatus.ACTIVE },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve(
          [] as { id: string; name: string | null; email: string }[]
        ),
  ]);

  const taxRateOptions = taxRates.map((t) => ({
    rate: t.rate.toString(),
    name: t.name,
  }));
  const products = await getCatalogProducts();
  const defaultRate =
    taxRates.find((t) => t.isDefault)?.rate.toString() ??
    taxRates[0]?.rate.toString() ??
    "0";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link
          href={`/presupuestos/${id}`}
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Volver al presupuesto
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Editar {quote.code}
        </h1>
      </div>

      <div className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
        <QuoteForm
          action={updateQuote}
          clients={clients}
          taxRates={taxRateOptions}
          defaultRate={defaultRate}
          canAssign={canAssign}
          owners={owners}
          submitLabel="Guardar cambios"
          products={products}
          quote={{
            id: quote.id,
            clientId: quote.clientId,
            clientLegalName: quote.client.legalName,
            currency: quote.currency,
            validUntil: quote.validUntil
              ? quote.validUntil.toISOString().slice(0, 10)
              : "",
            notes: quote.notes,
            ownerId: quote.ownerId,
            items: quote.items.map((it) => ({
              type: it.type,
              description: it.description,
              quantity: it.quantity.toString(),
              unit: it.unit,
              unitPrice: it.unitPrice.toString(),
              ivaRate: it.ivaRate.toString(),
            })),
          }}
        />
      </div>
    </div>
  );
}

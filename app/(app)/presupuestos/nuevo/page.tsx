import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canCreateQuotes,
  canAssignClients,
  clientScope,
} from "@/lib/permissions";
import { UserStatus } from "@/lib/generated/prisma/enums";
import { getCompanySettings } from "@/lib/company";
import { getCatalogProducts } from "@/lib/products";
import { QuoteForm } from "@/components/quote-form";
import { createQuote } from "../actions";

export default async function NewQuotePage() {
  const user = await requireActiveUser();
  if (!canCreateQuotes(user)) redirect("/presupuestos");

  const canAssign = canAssignClients(user);
  // Solo el conteo (para el estado vacío): el selector busca on-type en el
  // servidor, así no se serializa la cartera completa al navegador.
  const [clientCount, taxRates, owners] = await Promise.all([
    prisma.client.count({ where: clientScope(user) }),
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
  const defaultRate =
    taxRates.find((t) => t.isDefault)?.rate.toString() ??
    taxRates[0]?.rate.toString() ??
    "0";

  // Apply the company's "base design" defaults (validity + footer).
  const settings = await getCompanySettings();
  const products = await getCatalogProducts();
  let defaultValidUntil = "";
  if (settings?.quoteValidity) {
    const due = new Date();
    due.setDate(due.getDate() + settings.quoteValidity);
    defaultValidUntil = due.toISOString().slice(0, 10);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link
          href="/presupuestos"
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Volver a presupuestos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nuevo presupuesto
        </h1>
      </div>

      {clientCount === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-zinc-500 dark:bg-zinc-900">
          Primero necesitás un cliente en tu cartera.{" "}
          <Link href="/clientes/nuevo" className="text-primary hover:underline">
            Crear un cliente
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
          <QuoteForm
            action={createQuote}
            taxRates={taxRateOptions}
            defaultRate={defaultRate}
            canAssign={canAssign}
            owners={owners}
            submitLabel="Crear presupuesto"
            quote={{
              validUntil: defaultValidUntil,
              notes: settings?.quoteFooter ?? "",
            }}
            products={products}
          />
        </div>
      )}
    </div>
  );
}

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
import { QuoteForm } from "@/components/quote-form";
import { createQuote } from "../actions";

export default async function NewQuotePage() {
  const user = await requireActiveUser();
  if (!canCreateQuotes(user)) redirect("/presupuestos");

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
  const defaultRate =
    taxRates.find((t) => t.isDefault)?.rate.toString() ??
    taxRates[0]?.rate.toString() ??
    "0";

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

      {clients.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-zinc-500 dark:bg-zinc-950">
          Primero necesitás un cliente en tu cartera.{" "}
          <Link href="/clientes/nuevo" className="text-blue-600 hover:underline">
            Crear un cliente
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-6 dark:bg-zinc-950">
          <QuoteForm
            action={createQuote}
            clients={clients}
            taxRates={taxRateOptions}
            defaultRate={defaultRate}
            canAssign={canAssign}
            owners={owners}
            submitLabel="Crear presupuesto"
          />
        </div>
      )}
    </div>
  );
}

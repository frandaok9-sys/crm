import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canCreateOpportunities,
  canAssignClients,
  clientScope,
} from "@/lib/permissions";
import { UserStatus, Currency } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { ClientCombobox } from "@/components/client-combobox";
import { createOpportunity } from "../actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function NewOpportunityPage() {
  const user = await requireActiveUser();
  if (!canCreateOpportunities(user)) redirect("/oportunidades");

  const canAssign = canAssignClients(user);
  const [clients, stages, owners] = await Promise.all([
    prisma.client.findMany({
      where: clientScope(user),
      select: { id: true, legalName: true },
      orderBy: { legalName: "asc" },
    }),
    prisma.stage.findMany({ orderBy: { position: "asc" } }),
    canAssign
      ? prisma.user.findMany({
          where: { status: UserStatus.ACTIVE },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href="/oportunidades"
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Volver al pipeline
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nueva oportunidad
        </h1>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-zinc-500 dark:bg-zinc-950">
          Primero necesitás tener al menos un cliente en tu cartera.{" "}
          <Link href="/clientes/nuevo" className="text-primary hover:underline">
            Crear un cliente
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-6 dark:bg-zinc-950">
          <form action={createOpportunity} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Título *
              </span>
              <input
                name="title"
                required
                placeholder="Ej: Venta de 10 equipos"
                className={inputClass}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Cliente *
                </span>
                <ClientCombobox clients={clients} name="clientId" />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Etapa *
                </span>
                <select name="stageId" required className={inputClass}>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Ubicación de la obra
                </span>
                <input
                  name="siteAddress"
                  placeholder="Ej: Parque Industrial, Maipú"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Superficie estimada (m²)
                </span>
                <input
                  name="estimatedM2"
                  inputMode="decimal"
                  placeholder="Ej: 1200"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Monto estimado
                </span>
                <input
                  name="amount"
                  inputMode="decimal"
                  placeholder="1500.50"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Moneda
                </span>
                <select name="currency" defaultValue={Currency.ARS} className={inputClass}>
                  <option value={Currency.ARS}>Pesos (ARS)</option>
                  <option value={Currency.USD}>Dólares (USD)</option>
                </select>
              </label>

              {canAssign && (
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">
                    Vendedor asignado
                  </span>
                  <select name="ownerId" defaultValue="" className={inputClass}>
                    <option value="">Según el cliente / sin asignar</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name ?? o.email}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Notas
              </span>
              <textarea name="notes" rows={3} className={inputClass} />
            </label>

            <div className="flex justify-end">
              <Button type="submit">Crear oportunidad</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

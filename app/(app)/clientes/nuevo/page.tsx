import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canCreateClients, canAssignClients } from "@/lib/permissions";
import { UserStatus } from "@/lib/generated/prisma/enums";
import { ClientForm } from "@/components/client-form";
import { createClient } from "../actions";

export default async function NewClientPage() {
  const user = await requireActiveUser();
  if (!canCreateClients(user)) redirect("/clientes");

  const canAssign = canAssignClients(user);
  const owners = canAssign
    ? await prisma.user.findMany({
        where: { status: UserStatus.ACTIVE },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];

  const ownerField = canAssign ? (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">
        Vendedor asignado (cartera)
      </span>
      <select
        name="ownerId"
        defaultValue=""
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
      >
        <option value="">Sin asignar (cartera general)</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name ?? o.email}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href="/clientes" className="text-sm text-zinc-500 hover:underline">
          ← Volver a clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nuevo cliente
        </h1>
        {!canAssign && (
          <p className="mt-1 text-sm text-zinc-500">
            El cliente se agregará a tu cartera.
          </p>
        )}
      </div>

      <div className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
        <ClientForm
          action={createClient}
          submitLabel="Crear cliente"
          extraFields={ownerField}
        />
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canViewRecord,
  canEditClient,
  canAssignClients,
} from "@/lib/permissions";
import { IVA_LABELS } from "@/lib/clients";
import { UserStatus } from "@/lib/generated/prisma/enums";
import { ClientForm } from "@/components/client-form";
import { Button } from "@/components/ui/button";
import { updateClient, assignClient, addContact } from "../actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireActiveUser();

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
    },
  });
  if (!client) notFound();
  if (!canViewRecord(user, client)) redirect("/clientes");

  const canEdit = canEditClient(user, client);
  const canAssign = canAssignClients(user);

  const owners = canAssign
    ? await prisma.user.findMany({
        where: { status: UserStatus.ACTIVE },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/clientes" className="text-sm text-zinc-500 hover:underline">
          ← Volver a clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {client.legalName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Cartera:{" "}
          {client.owner ? (
            <span className="font-medium">
              {client.owner.name ?? client.owner.email}
            </span>
          ) : (
            <span className="text-zinc-400">Sin asignar (cartera general)</span>
          )}
        </p>
        <Link
          href={`/clientes/${client.id}/cuenta`}
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          Ver cuenta corriente →
        </Link>
      </div>

      {/* Datos del cliente */}
      <section className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-medium text-zinc-500">
          Datos del cliente
        </h2>
        {canEdit ? (
          <ClientForm
            action={updateClient}
            client={client}
            submitLabel="Guardar cambios"
          />
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Nombre de fantasía" value={client.tradeName} />
            <Detail label="CUIT" value={client.taxId} />
            <Detail
              label="Condición IVA"
              value={
                client.ivaCondition ? IVA_LABELS[client.ivaCondition] : null
              }
            />
            <Detail label="Rubro" value={client.industry} />
            <Detail label="Email" value={client.email} />
            <Detail label="Teléfono" value={client.phone} />
            <Detail label="Dirección" value={client.address} />
            <Detail label="Localidad" value={client.city} />
            <Detail label="Provincia" value={client.province} />
            <Detail label="Notas" value={client.notes} />
          </dl>
        )}
      </section>

      {/* Asignación de cartera */}
      {canAssign && (
        <section className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-500">
            Asignar cartera
          </h2>
          <form action={assignClient} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={client.id} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Vendedor
              </span>
              <select
                name="ownerId"
                defaultValue={client.ownerId ?? ""}
                className={inputClass}
              >
                <option value="">Sin asignar (cartera general)</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name ?? o.email}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline">
              Asignar
            </Button>
          </form>
        </section>
      )}

      {/* Contactos */}
      <section className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-medium text-zinc-500">
          Contactos ({client.contacts.length})
        </h2>

        {client.contacts.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin contactos cargados.</p>
        ) : (
          <ul className="divide-y">
            {client.contacts.map((contact) => (
              <li key={contact.id} className="flex flex-wrap gap-x-4 py-3 text-sm">
                <span className="font-medium">
                  {contact.name}
                  {contact.isPrimary && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Principal
                    </span>
                  )}
                </span>
                {contact.position && (
                  <span className="text-zinc-500">{contact.position}</span>
                )}
                {contact.email && (
                  <span className="text-zinc-500">{contact.email}</span>
                )}
                {contact.phone && (
                  <span className="text-zinc-500">{contact.phone}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form
            action={addContact}
            className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2"
          >
            <input type="hidden" name="clientId" value={client.id} />
            <input
              name="name"
              required
              placeholder="Nombre y apellido *"
              className={inputClass}
            />
            <input name="position" placeholder="Cargo" className={inputClass} />
            <input
              name="email"
              type="email"
              placeholder="Email"
              className={inputClass}
            />
            <input name="phone" placeholder="Teléfono" className={inputClass} />
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input type="checkbox" name="isPrimary" />
              Contacto principal
            </label>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" variant="outline">
                Agregar contacto
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5">{value ?? "—"}</dd>
    </div>
  );
}

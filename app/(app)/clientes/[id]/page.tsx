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
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ICONS } from "@/lib/activities";
import { UserStatus, ClientActivityType } from "@/lib/generated/prisma/enums";
import { ClientForm } from "@/components/client-form";
import { ActivityForm } from "@/components/activity-form";
import { Button } from "@/components/ui/button";
import {
  updateClient,
  assignClient,
  addContact,
  toggleActivityDone,
  deleteActivity,
} from "../actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

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
      activities: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { createdBy: { select: { name: true, email: true } } },
      },
    },
  });
  if (!client) notFound();
  if (!canViewRecord(user, client)) redirect("/clientes");

  const canEdit = canEditClient(user, client);
  const canAssign = canAssignClients(user);

  // Actividades: tareas abiertas arriba, después el historial.
  const pendingTasks = client.activities.filter(
    (a) => a.type === ClientActivityType.TASK && !a.doneAt
  );
  const history = client.activities.filter(
    (a) => !(a.type === ClientActivityType.TASK && !a.doneAt)
  );
  const now = Date.now();

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

      {/* Actividades: historial comercial + tareas */}
      <section className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-medium text-zinc-500">
          Actividades y tareas
        </h2>

        {canEdit && <ActivityForm clientId={client.id} />}

        {pendingTasks.length > 0 && (
          <div className="mt-5 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Tareas pendientes
            </h3>
            <ul className="space-y-2">
              {pendingTasks.map((a) => {
                const overdue = a.dueAt && a.dueAt.getTime() < now;
                return (
                  <li
                    key={a.id}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                      overdue
                        ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
                        : "border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    <form action={toggleActivityDone}>
                      <input type="hidden" name="id" value={a.id} />
                      <button
                        type="submit"
                        title="Marcar como completada"
                        className="mt-0.5 h-4 w-4 rounded border border-zinc-400 hover:bg-emerald-100 dark:border-zinc-500 dark:hover:bg-emerald-900"
                      />
                    </form>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{a.title}</p>
                      {a.notes && <p className="text-zinc-500">{a.notes}</p>}
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {a.dueAt ? (
                          <span className={overdue ? "font-semibold text-red-600 dark:text-red-400" : ""}>
                            Vence {a.dueAt.toLocaleDateString("es-AR")}
                            {overdue && " · VENCIDA"}
                          </span>
                        ) : (
                          "Sin fecha límite"
                        )}{" "}
                        · {a.createdBy.name ?? a.createdBy.email}
                      </p>
                    </div>
                    {canEdit && (
                      <form action={deleteActivity}>
                        <input type="hidden" name="id" value={a.id} />
                        <button
                          type="submit"
                          title="Borrar"
                          className="text-zinc-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Historial
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Todavía no hay actividades registradas.
            </p>
          ) : (
            <ul className="divide-y">
              {history.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className="mt-0.5" aria-hidden>
                    {ACTIVITY_TYPE_ICONS[a.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={a.doneAt ? "text-zinc-500 line-through" : ""}>
                      <span className="mr-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800">
                        {ACTIVITY_TYPE_LABELS[a.type]}
                      </span>
                      {a.title}
                    </p>
                    {a.notes && <p className="mt-0.5 text-zinc-500">{a.notes}</p>}
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {a.createdAt.toLocaleDateString("es-AR")} ·{" "}
                      {a.createdBy.name ?? a.createdBy.email}
                      {a.doneAt && " · completada"}
                    </p>
                  </div>
                  {a.type === ClientActivityType.TASK && a.doneAt && (
                    <form action={toggleActivityDone}>
                      <input type="hidden" name="id" value={a.id} />
                      <button
                        type="submit"
                        className="text-xs text-zinc-400 hover:underline"
                      >
                        Reabrir
                      </button>
                    </form>
                  )}
                  {canEdit && (
                    <form action={deleteActivity}>
                      <input type="hidden" name="id" value={a.id} />
                      <button
                        type="submit"
                        title="Borrar"
                        className="text-zinc-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
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

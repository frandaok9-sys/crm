import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canViewRecord,
  canEditOpportunity,
  canAssignClients,
  clientScope,
} from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { hasGoogleTasksAccess } from "@/lib/google-tasks";
import { UserStatus, Currency } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { ClientCombobox } from "@/components/client-combobox";
import { createReminder, deleteReminder, updateOpportunity } from "../actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function formatDate(date: Date): string {
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireActiveUser();

  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, legalName: true } },
      owner: { select: { name: true, email: true } },
      stage: { select: { name: true } },
      reminders: { orderBy: { dueAt: "asc" } },
    },
  });
  if (!opportunity) notFound();
  if (!canViewRecord(user, opportunity)) redirect("/oportunidades");

  const canEdit = canEditOpportunity(user, opportunity);
  const canAssign = canAssignClients(user);
  const googleConnected = canEdit ? await hasGoogleTasksAccess(user.id) : false;
  const amountLabel = formatMoney(
    opportunity.amount ? opportunity.amount.toString() : null,
    opportunity.currency
  );

  const [stages, clients, owners] = await Promise.all([
    prisma.stage.findMany({ orderBy: { position: "asc" } }),
    prisma.client.findMany({
      where: clientScope(user),
      select: { id: true, legalName: true },
      orderBy: { legalName: "asc" },
    }),
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/oportunidades"
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Volver al pipeline
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {opportunity.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          <Link
            href={`/clientes/${opportunity.client.id}`}
            className="hover:underline"
          >
            {opportunity.client.legalName}
          </Link>{" "}
          · {opportunity.stage.name}
          {amountLabel && <> · {amountLabel}</>}
          {opportunity.estimatedM2 && (
            <> · {opportunity.estimatedM2.toString()} m²</>
          )}
          {opportunity.siteAddress && <> · {opportunity.siteAddress}</>}
        </p>
      </div>

      {canEdit && (
        <section className="rounded-xl border bg-white p-6 dark:bg-zinc-950">
          <h2 className="mb-4 text-sm font-medium text-zinc-500">
            Datos de la oportunidad
          </h2>
          <form action={updateOpportunity} className="space-y-4">
            <input type="hidden" name="id" value={opportunity.id} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Título *
              </span>
              <input
                name="title"
                required
                defaultValue={opportunity.title}
                className={inputClass}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Cliente *
                </span>
                <ClientCombobox
                  clients={clients}
                  name="clientId"
                  defaultId={opportunity.client.id}
                  defaultLabel={opportunity.client.legalName}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Etapa *
                </span>
                <select
                  name="stageId"
                  defaultValue={opportunity.stageId}
                  className={inputClass}
                >
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
                  defaultValue={opportunity.siteAddress ?? ""}
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
                  defaultValue={
                    opportunity.estimatedM2
                      ? opportunity.estimatedM2.toString()
                      : ""
                  }
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
                  defaultValue={
                    opportunity.amount ? opportunity.amount.toString() : ""
                  }
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Moneda
                </span>
                <select
                  name="currency"
                  defaultValue={opportunity.currency}
                  className={inputClass}
                >
                  <option value={Currency.ARS}>Pesos (ARS)</option>
                  <option value={Currency.USD}>Dólares (USD)</option>
                </select>
              </label>

              {canAssign && (
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">
                    Vendedor asignado
                  </span>
                  <select
                    name="ownerId"
                    defaultValue={opportunity.ownerId ?? ""}
                    className={inputClass}
                  >
                    <option value="">Sin asignar</option>
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
              <textarea
                name="notes"
                rows={3}
                defaultValue={opportunity.notes ?? ""}
                className={inputClass}
              />
            </label>

            <div className="flex justify-end">
              <Button type="submit">Guardar cambios</Button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border bg-white p-6 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-500">
            Alertas ({opportunity.reminders.length})
          </h2>
          <span className="text-xs text-zinc-400">
            {googleConnected
              ? "Sincroniza con Google Tasks"
              : canEdit
                ? "Google Tasks no conectado"
                : ""}
          </span>
        </div>

        {canEdit && !googleConnected && (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Para que las alertas se creen en tu Google Tasks, cerrá sesión y
            volvé a iniciarla para autorizar el permiso. Mientras tanto, las
            alertas se guardan igual dentro del CRM.
          </p>
        )}

        {opportunity.reminders.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin alertas cargadas.</p>
        ) : (
          <ul className="divide-y">
            {opportunity.reminders.map((reminder) => (
              <li
                key={reminder.id}
                className="flex items-start justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{reminder.title}</p>
                  <p className="text-xs text-zinc-500">
                    {formatDate(reminder.dueAt)}
                    {reminder.notes ? ` · ${reminder.notes}` : ""}
                  </p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${
                      reminder.googleTaskId
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                    }`}
                  >
                    {reminder.googleTaskId
                      ? "✓ En Google Tasks"
                      : "Solo en el CRM"}
                  </span>
                </div>
                {canEdit && (
                  <form action={deleteReminder}>
                    <input type="hidden" name="id" value={reminder.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Borrar
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form
            action={createReminder}
            className="mt-5 space-y-3 border-t pt-5"
          >
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Título de la alerta *
                </span>
                <input
                  name="title"
                  required
                  placeholder="Ej: Llamar para seguimiento"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Fecha y hora *
                </span>
                <input
                  name="dueAt"
                  type="datetime-local"
                  required
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Nota
                </span>
                <input name="notes" className={inputClass} />
              </label>
            </div>
            <div className="flex justify-end">
              <Button type="submit">Agregar alerta</Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

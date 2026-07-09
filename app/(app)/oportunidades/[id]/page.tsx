import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canViewRecord, canEditOpportunity } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { hasGoogleTasksAccess } from "@/lib/google-tasks";
import { Button } from "@/components/ui/button";
import { createReminder, deleteReminder } from "../actions";

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
  const googleConnected = canEdit ? await hasGoogleTasksAccess(user.id) : false;
  const amountLabel = formatMoney(
    opportunity.amount ? opportunity.amount.toString() : null,
    opportunity.currency
  );

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
        </p>
      </div>

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

import { addQuoteTask } from "@/app/(app)/presupuestos/actions";
import {
  toggleActivityDone,
  replyAndConfirmTask,
  deleteActivity,
} from "@/app/(app)/clientes/actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

export const TASK_PRIORITY_LABELS: Record<number, string> = {
  0: "Alta",
  1: "Media",
  2: "Baja",
};

const PRIORITY_BADGE: Record<number, string> = {
  0: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  1: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  2: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

export type QuoteTask = {
  id: string;
  title: string;
  priority: number;
  doneAt: Date | null;
  reply: string | null;
  createdAt: Date;
  createdById: string;
  assignedToId: string | null;
  createdBy: { name: string | null; email: string };
  assignedTo: { id: string; name: string | null; email: string } | null;
};

export type QuoteTaskUser = { id: string; label: string };

/**
 * Chat de tareas de un presupuesto: cada usuario escribe una tarea, puede
 * delegarla a un @usuario y ponerle prioridad. Las abiertas quedan pineadas
 * arriba en orden de prioridad; las delegadas se cierran solo cuando el
 * asignado responde y confirma. Las resueltas quedan abajo como historial.
 */
export function QuoteTasks({
  quoteId,
  tasks,
  teammates,
  currentUserId,
}: {
  quoteId: string;
  tasks: QuoteTask[];
  teammates: QuoteTaskUser[];
  currentUserId: string;
}) {
  const open = [...tasks]
    .filter((t) => !t.doneAt)
    .sort(
      (a, b) =>
        a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime()
    );
  const done = [...tasks]
    .filter((t) => t.doneAt)
    .sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0));

  const userName = (u: { name: string | null; email: string }) =>
    u.name ?? u.email;

  return (
    <section className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
      <h2 className="mb-1 text-sm font-medium text-zinc-500">Tareas</h2>
      <p className="mb-4 text-xs text-zinc-400">
        Chat del presupuesto: escribí una tarea, asignala a un compañero y
        ponele prioridad. Queda pineada acá hasta que se resuelva.
      </p>

      {open.length > 0 && (
        <ul className="mb-4 space-y-2">
          {open.map((t) => {
            const delegated = !!t.assignedToId;
            const iAmAssignee = t.assignedToId === currentUserId;
            return (
              <li
                key={t.id}
                className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm dark:border-zinc-700"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_BADGE[t.priority] ?? PRIORITY_BADGE[1]}`}
                >
                  {TASK_PRIORITY_LABELS[t.priority] ?? "Media"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {userName(t.createdBy)} ·{" "}
                    {t.createdAt.toLocaleDateString("es-AR")}
                    {delegated && t.assignedTo && (
                      <span className="font-medium text-primary">
                        {" "}
                        → @{userName(t.assignedTo)}
                      </span>
                    )}
                  </p>
                  {delegated && iAmAssignee && (
                    <form
                      action={replyAndConfirmTask}
                      className="mt-2 flex items-start gap-2"
                    >
                      <input type="hidden" name="id" value={t.id} />
                      <textarea
                        name="reply"
                        required
                        rows={1}
                        maxLength={1000}
                        placeholder="Contá cómo la resolviste…"
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        Responder y confirmar
                      </button>
                    </form>
                  )}
                  {delegated && !iAmAssignee && t.assignedTo && (
                    <p className="mt-1 text-xs italic text-zinc-400">
                      Esperando la respuesta de @{userName(t.assignedTo)}.
                    </p>
                  )}
                </div>
                {!delegated && (
                  <form action={toggleActivityDone}>
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      title="Marcar como completada"
                      className="mt-0.5 h-4 w-4 rounded border border-zinc-400 hover:bg-emerald-100 dark:border-zinc-500 dark:hover:bg-emerald-900"
                    />
                  </form>
                )}
                {t.createdById === currentUserId && (
                  <form action={deleteActivity}>
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      title="Borrar tarea"
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
      )}

      {done.length > 0 && (
        <ul className="mb-4 space-y-1 border-t pt-3">
          {done.map((t) => (
            <li key={t.id} className="py-1 text-sm text-zinc-400">
              <span className="line-through">{t.title}</span>
              <span className="text-xs">
                {" "}
                · {userName(t.createdBy)}
                {t.assignedTo && <> → @{userName(t.assignedTo)}</>}
                {t.doneAt && <> · {t.doneAt.toLocaleDateString("es-AR")}</>}
              </span>
              {t.reply && (
                <p className="ml-4 text-xs text-zinc-500">
                  Respuesta: {t.reply}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Escribir una tarea nueva (estilo chat, abajo del hilo) */}
      <form action={addQuoteTask} className="space-y-2">
        <input type="hidden" name="quoteId" value={quoteId} />
        <textarea
          name="title"
          required
          rows={2}
          maxLength={200}
          placeholder="Escribí la tarea… (ej: pasar precio actualizado del epoxi)"
          className={inputClass}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select name="assignedToId" defaultValue="" className={`${inputClass} w-auto`}>
            <option value="">Para mí</option>
            {teammates.map((t) => (
              <option key={t.id} value={t.id}>
                @{t.label}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue="1" className={`${inputClass} w-auto`}>
            <option value="0">Prioridad alta</option>
            <option value="1">Prioridad media</option>
            <option value="2">Prioridad baja</option>
          </select>
          <button
            type="submit"
            className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Agregar tarea
          </button>
        </div>
      </form>
    </section>
  );
}

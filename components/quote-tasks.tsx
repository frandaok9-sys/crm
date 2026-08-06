import { addQuoteTask } from "@/app/(app)/presupuestos/actions";
import {
  toggleActivityDone,
  replyAndConfirmTask,
  deleteActivity,
} from "@/app/(app)/clientes/actions";

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

// Prioridad: 0=Alta (rojo), 1=Media (ámbar), 2=Baja (gris).
const PRIORITY_DOT: Record<number, string> = {
  0: "bg-red-500",
  1: "bg-amber-400",
  2: "bg-zinc-300 dark:bg-zinc-600",
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
 * Chat de tareas de un presupuesto: se escribe una línea, se elige a quién y
 * la prioridad. Las abiertas quedan pineadas por prioridad; una delegada se
 * cierra cuando el asignado responde y confirma.
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
      <h2 className="mb-4 text-sm font-medium text-zinc-500">Tareas</h2>

      {open.length > 0 && (
        <ul className="mb-4 space-y-2">
          {open.map((t) => {
            const iAmAssignee = t.assignedToId === currentUserId;
            return (
              <li
                key={t.id}
                className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm dark:border-zinc-700"
              >
                <span
                  title={["Prioridad alta", "Prioridad media", "Prioridad baja"][t.priority] ?? "Prioridad media"}
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority] ?? PRIORITY_DOT[1]}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {userName(t.createdBy)}
                    {t.assignedTo && (
                      <span className="font-medium text-primary">
                        {" "}
                        → @{userName(t.assignedTo)}
                      </span>
                    )}
                  </p>
                  {iAmAssignee && (
                    <form
                      action={replyAndConfirmTask}
                      className="mt-2 flex items-center gap-2"
                    >
                      <input type="hidden" name="id" value={t.id} />
                      <input
                        name="reply"
                        required
                        maxLength={1000}
                        placeholder="Respondé para confirmarla…"
                        className={`${inputClass} min-w-0 flex-1 py-1.5`}
                      />
                      <button
                        type="submit"
                        title="Responder y confirmar"
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        Confirmar
                      </button>
                    </form>
                  )}
                </div>
                {!t.assignedToId && (
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
        <details className="mb-4">
          <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-600">
            Resueltas ({done.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {done.map((t) => (
              <li key={t.id} className="text-sm text-zinc-400">
                <span className="line-through">{t.title}</span>
                {t.assignedTo && (
                  <span className="text-xs"> · @{userName(t.assignedTo)}</span>
                )}
                {t.reply && (
                  <p className="ml-4 text-xs text-zinc-500">“{t.reply}”</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Escribir una tarea: una sola línea, estilo chat */}
      <form action={addQuoteTask} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="quoteId" value={quoteId} />
        <input
          name="title"
          required
          maxLength={200}
          placeholder="Escribí una tarea…"
          className={`${inputClass} min-w-[180px] flex-1`}
        />
        <select name="assignedToId" defaultValue="" className={inputClass}>
          <option value="">Para mí</option>
          {teammates.map((t) => (
            <option key={t.id} value={t.id}>
              @{t.label}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue="1" className={inputClass}>
          <option value="0">🔴 Alta</option>
          <option value="1">🟡 Media</option>
          <option value="2">⚪ Baja</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Agregar
        </button>
      </form>
    </section>
  );
}

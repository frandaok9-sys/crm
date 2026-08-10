"use client";

import { deleteQuote } from "@/app/(app)/presupuestos/actions";

/**
 * Botón "Eliminar presupuesto" con confirmación nativa. Borra el presupuesto
 * COMPLETO (todas sus revisiones, con ítems, fotos y tareas). El servidor
 * re-valida permisos y frena si está facturado en la cuenta corriente.
 */
export function DeleteQuoteButton({
  quoteId,
  code,
  revisionCount,
  taskCount,
}: {
  quoteId: string;
  code: string;
  revisionCount: number;
  taskCount: number;
}) {
  const notes: string[] = [];
  if (revisionCount > 1) {
    notes.push(`se borran sus ${revisionCount} revisiones`);
  }
  if (taskCount > 0) {
    notes.push(`se borran ${taskCount} tarea(s) del chat`);
  }
  const warning =
    `¿Eliminar definitivamente el presupuesto ${code}?` +
    (notes.length > 0 ? `\n\nTené en cuenta: ${notes.join("; ")}.` : "") +
    "\n\nEsta acción no se puede deshacer.";

  return (
    <form
      action={deleteQuote}
      onSubmit={(e) => {
        if (!confirm(warning)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={quoteId} />
      <button
        type="submit"
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Eliminar presupuesto
      </button>
    </form>
  );
}

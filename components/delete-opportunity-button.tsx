"use client";

import { deleteOpportunity } from "@/app/(app)/oportunidades/actions";

/**
 * Botón "Eliminar oportunidad" con confirmación nativa. El servidor
 * re-valida permisos; los gastos de la obra se conservan (quedan como
 * gastos generales).
 */
export function DeleteOpportunityButton({
  opportunityId,
  title,
  reminderCount,
  expenseCount,
}: {
  opportunityId: string;
  title: string;
  reminderCount: number;
  expenseCount: number;
}) {
  const notes: string[] = [];
  if (reminderCount > 0) notes.push(`se borran ${reminderCount} alerta(s)`);
  if (expenseCount > 0) {
    notes.push(
      `los ${expenseCount} gasto(s) cargados a esta obra se conservan como gastos generales`
    );
  }
  const warning =
    `¿Eliminar definitivamente la oportunidad "${title}"?` +
    (notes.length > 0 ? `\n\nTené en cuenta: ${notes.join("; ")}.` : "") +
    "\n\nEsta acción no se puede deshacer.";

  return (
    <form
      action={deleteOpportunity}
      onSubmit={(e) => {
        if (!confirm(warning)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={opportunityId} />
      <button
        type="submit"
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Eliminar oportunidad
      </button>
    </form>
  );
}

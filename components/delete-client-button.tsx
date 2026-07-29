"use client";

import { deleteClient } from "@/app/(app)/clientes/actions";

/**
 * Botón "Eliminar cliente" con confirmación nativa. El servidor re-valida
 * permisos y aplica el freno contable (con cuenta corriente no se borra).
 */
export function DeleteClientButton({
  clientId,
  clientName,
  opportunityCount,
  quoteCount,
}: {
  clientId: string;
  clientName: string;
  opportunityCount: number;
  quoteCount: number;
}) {
  const extras: string[] = [];
  if (opportunityCount > 0) {
    extras.push(`${opportunityCount} oportunidad(es)`);
  }
  if (quoteCount > 0) extras.push(`${quoteCount} presupuesto(s)`);
  const warning =
    `¿Eliminar definitivamente a "${clientName}"?` +
    (extras.length > 0
      ? `\n\nSe borran también: ${extras.join(" y ")}.`
      : "") +
    "\n\nEsta acción no se puede deshacer.";

  return (
    <form
      action={deleteClient}
      onSubmit={(e) => {
        if (!confirm(warning)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={clientId} />
      <button
        type="submit"
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Eliminar cliente
      </button>
    </form>
  );
}

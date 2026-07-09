"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { ImportState } from "@/lib/client-import";
import { importClients } from "@/app/(app)/clientes/actions";

type Owner = { id: string; name: string | null; email: string };

const initialState: ImportState = { status: "idle" };

export function ImportClientsForm({
  owners,
  canAssign,
}: {
  owners: Owner[];
  canAssign: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    importClients,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      {canAssign && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Asignar los clientes importados a
          </span>
          <select
            name="ownerId"
            defaultValue=""
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Sin asignar (cartera general)</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name ?? owner.email}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Archivo Excel (.xlsx)
        </span>
        <input
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:text-white dark:file:bg-zinc-100 dark:file:text-black"
        />
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Importando…" : "Importar clientes"}
      </Button>

      {state.status === "error" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <p className="font-medium">
            ✅ {state.created} cliente(s) importado(s).
          </p>
          {state.skipped > 0 && (
            <p className="mt-1">
              {state.skipped} omitido(s) por CUIT ya existente.
            </p>
          )}
          {state.invalid > 0 && (
            <p className="mt-1">
              {state.invalid} fila(s) ignorada(s) por falta de razón social.
            </p>
          )}
        </div>
      )}
    </form>
  );
}

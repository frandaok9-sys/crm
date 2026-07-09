"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { ProductImportState } from "@/lib/product-import";
import { importProducts } from "@/app/(app)/productos/actions";

const initialState: ProductImportState = { status: "idle" };

export function ImportProductsForm() {
  const [state, formAction, pending] = useActionState(
    importProducts,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Marca / proveedor de esta lista (si el archivo no tiene columna
          &quot;Marca&quot;)
        </span>
        <input
          name="defaultBrand"
          placeholder="Ej: Sinteplast"
          list="import-brand-suggestions"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
        <datalist id="import-brand-suggestions">
          <option value="Sinteplast" />
          <option value="Ashford" />
        </datalist>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Archivo Excel (.xlsx)
        </span>
        <input
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:text-white dark:file:bg-zinc-100 dark:file:text-black"
        />
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Importando…" : "Importar productos"}
      </Button>

      {state.status === "error" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <p className="font-medium">
            ✅ {state.created} producto(s) importado(s).
          </p>
          {state.skipped > 0 && (
            <p className="mt-1">
              {state.skipped} omitido(s) por nombre y marca ya existentes.
            </p>
          )}
          {state.invalid > 0 && (
            <p className="mt-1">
              {state.invalid} fila(s) ignorada(s) por falta de nombre.
            </p>
          )}
        </div>
      )}
    </form>
  );
}

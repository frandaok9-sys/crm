import Link from "next/link";
import { redirect } from "next/navigation";

import { requireActiveUser } from "@/lib/auth";
import { canManageProducts } from "@/lib/permissions";
import { PRODUCT_IMPORT_COLUMNS } from "@/lib/product-import";
import { ImportProductsForm } from "@/components/import-products-form";

export default async function ImportProductsPage() {
  const user = await requireActiveUser();
  if (!canManageProducts(user)) redirect("/productos");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/productos" className="text-sm text-zinc-500 hover:underline">
          ← Volver a productos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Importar productos desde Excel
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Subí la lista de precios (Sinteplast, Ashford u otra). La primera
          fila debe tener los títulos de las columnas.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
        <h2 className="text-sm font-medium">Columnas reconocidas</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRODUCT_IMPORT_COLUMNS.map((column) => (
            <span
              key={column.field}
              className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {column.header}
              {"required" in column && column.required ? " *" : ""}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          El precio se toma <strong>sin IVA</strong>. Si una columna no está,
          se usan valores por defecto (unidad “un”, IVA 21%, pesos).
        </p>
        <a
          href="/productos/importar/plantilla"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          ↓ Descargar plantilla de ejemplo (.xlsx)
        </a>
      </div>

      <div className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
        <ImportProductsForm />
      </div>
    </div>
  );
}

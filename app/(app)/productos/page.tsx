import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageProducts } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { toggleProductActive } from "./actions";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; marca?: string }>;
}) {
  const { q, marca } = await searchParams;
  const user = await requireActiveUser();
  const canManage = canManageProducts(user);

  const products = await prisma.product.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(marca ? { brand: { equals: marca, mode: "insensitive" } } : {}),
    },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
  });

  const brands = await prisma.product.findMany({
    where: { brand: { not: null } },
    select: { brand: true },
    distinct: ["brand"],
    orderBy: { brand: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {products.length} producto(s) en el catálogo. Precios sin IVA.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Link href="/productos/importar">
              <Button variant="outline">Importar Excel</Button>
            </Link>
            <Link href="/productos/nuevo">
              <Button>Nuevo producto</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Búsqueda y filtro por marca */}
      <form className="mb-4 flex flex-wrap items-center gap-2" method="GET">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre, código o descripción…"
          className="w-72 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
        {marca && <input type="hidden" name="marca" value={marca} />}
        <Button type="submit" variant="outline" size="sm">
          Buscar
        </Button>
        <div className="ml-2 flex flex-wrap gap-1.5">
          <Link
            href="/productos"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !marca
                ? "bg-primary text-white"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            Todas
          </Link>
          {brands.map((b) => (
            <Link
              key={b.brand}
              href={`/productos?marca=${encodeURIComponent(b.brand ?? "")}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                marca?.toLowerCase() === b.brand?.toLowerCase()
                  ? "bg-primary text-white"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {b.brand}
            </Link>
          ))}
        </div>
      </form>

      {products.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-zinc-500 dark:bg-zinc-900">
          {q || marca
            ? "No se encontraron productos con ese criterio."
            : "El catálogo está vacío. Cargá productos a mano o importá tu lista de precios en Excel."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Marca</th>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Unidad</th>
                <th className="px-4 py-3 text-right font-medium">Precio</th>
                <th className="px-4 py-3 text-right font-medium">IVA</th>
                {canManage && <th className="px-4 py-3 font-medium">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className={`border-b last:border-0 ${
                    product.isActive ? "" : "opacity-45"
                  }`}
                >
                  <td className="px-4 py-3">
                    {canManage ? (
                      <Link
                        href={`/productos/${product.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {product.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{product.name}</span>
                    )}
                    {product.description && (
                      <div className="text-xs text-zinc-500">
                        {product.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{product.brand ?? "—"}</td>
                  <td className="px-4 py-3">{product.sku ?? "—"}</td>
                  <td className="px-4 py-3">{product.unit}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatMoney(product.price.toString(), product.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {Number(product.ivaRate)}%
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <form action={toggleProductActive}>
                        <input type="hidden" name="id" value={product.id} />
                        <SubmitButton size="sm" variant="ghost" pendingText="…">
                          {product.isActive ? "Desactivar" : "Reactivar"}
                        </SubmitButton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

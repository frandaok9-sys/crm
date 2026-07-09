import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageProducts } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { toggleProductActive } from "./actions";

const GRID =
  "grid grid-cols-[2.6fr_0.9fr_0.9fr_0.7fr_1.1fr_0.6fr_1fr] items-center";

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

  const pillBase =
    "rounded-[20px] px-3.5 py-1.5 text-xs font-semibold transition-colors";
  const pillOn = "bg-primary text-white";
  const pillOff =
    "border border-avbd bg-transparent text-muted-foreground hover:text-text2";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Productos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {products.length} producto(s) en el catálogo · precios sin IVA.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2.5">
            <Link href="/productos/importar">
              <Button variant="outline" size="cta">
                Importar Excel
              </Button>
            </Link>
            <Link href="/productos/nuevo">
              <Button size="cta">+ Nuevo producto</Button>
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form method="GET" className="shrink-0">
          {marca && <input type="hidden" name="marca" value={marca} />}
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por nombre, código o descripción…"
            className="w-[320px] rounded-[10px] border border-border bg-field px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted2 focus:border-muted-foreground"
          />
        </form>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/productos"
            className={`${pillBase} ${!marca ? pillOn : pillOff}`}
          >
            Todas
          </Link>
          {brands.map((b) => (
            <Link
              key={b.brand}
              href={`/productos?marca=${encodeURIComponent(b.brand ?? "")}`}
              className={`${pillBase} ${
                marca?.toLowerCase() === b.brand?.toLowerCase()
                  ? pillOn
                  : pillOff
              }`}
            >
              {b.brand}
            </Link>
          ))}
        </div>
      </div>

      <section className="overflow-hidden rounded-[12px] border bg-card">
        <div
          className={`${GRID} border-b border-border2 bg-card2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground`}
        >
          <span>Producto</span>
          <span>Marca</span>
          <span>Código</span>
          <span>Unidad</span>
          <span className="text-right">Precio</span>
          <span className="text-right">IVA</span>
          <span className="text-right">Acciones</span>
        </div>

        {products.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {q || marca
              ? "No se encontraron productos con ese criterio."
              : "El catálogo está vacío. Cargá productos a mano o importá tu lista de precios."}
          </div>
        ) : (
          products.map((product) => (
            <div
              key={product.id}
              className={`${GRID} border-b border-border2 px-5 py-[13px] text-[13px] transition-colors last:border-0 hover:bg-hoverbg ${
                product.isActive ? "" : "opacity-45"
              }`}
            >
              <span className="min-w-0 pr-3">
                {canManage ? (
                  <Link
                    href={`/productos/${product.id}`}
                    className="block truncate text-[13.5px] font-bold text-foreground hover:underline"
                  >
                    {product.name}
                  </Link>
                ) : (
                  <span className="block truncate text-[13.5px] font-bold">
                    {product.name}
                  </span>
                )}
                {product.description && (
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {product.description}
                  </span>
                )}
              </span>
              <span className="truncate pr-2 text-text2">
                {product.brand ?? "—"}
              </span>
              <span className="tabular-nums text-text2">
                {product.sku ?? "—"}
              </span>
              <span className="text-text2">{product.unit}</span>
              <span className="text-right font-bold tabular-nums">
                {formatMoney(product.price.toString(), product.currency)}
              </span>
              <span className="text-right tabular-nums text-text2">
                {Number(product.ivaRate)}%
              </span>
              <span className="text-right">
                {canManage && (
                  <form action={toggleProductActive} className="inline">
                    <input type="hidden" name="id" value={product.id} />
                    <SubmitButton
                      variant="ghost"
                      size="sm"
                      pendingText="…"
                      className="h-auto p-0 text-[12.5px] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                    >
                      {product.isActive ? "Desactivar" : "Reactivar"}
                    </SubmitButton>
                  </form>
                )}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

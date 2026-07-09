import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageProducts } from "@/lib/permissions";
import { ProductForm } from "@/components/product-form";
import { updateProduct } from "../actions";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireActiveUser();
  if (!canManageProducts(user)) redirect("/productos");

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href="/productos" className="text-sm text-zinc-500 hover:underline">
          ← Volver a productos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Editar producto
        </h1>
      </div>
      <div className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
        <ProductForm
          action={updateProduct}
          submitLabel="Guardar cambios"
          product={{
            id: product.id,
            name: product.name,
            brand: product.brand,
            sku: product.sku,
            description: product.description,
            unit: product.unit,
            price: product.price.toString(),
            currency: product.currency,
            ivaRate: product.ivaRate.toString(),
          }}
        />
      </div>
    </div>
  );
}

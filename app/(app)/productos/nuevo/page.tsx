import Link from "next/link";
import { redirect } from "next/navigation";

import { requireActiveUser } from "@/lib/auth";
import { canManageProducts } from "@/lib/permissions";
import { ProductForm } from "@/components/product-form";
import { createProduct } from "../actions";

export default async function NewProductPage() {
  const user = await requireActiveUser();
  if (!canManageProducts(user)) redirect("/productos");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href="/productos" className="text-sm text-zinc-500 hover:underline">
          ← Volver a productos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nuevo producto
        </h1>
      </div>
      <div className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
        <ProductForm action={createProduct} submitLabel="Crear producto" />
      </div>
    </div>
  );
}

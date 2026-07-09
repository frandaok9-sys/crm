import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/opportunities";
import type { CatalogProduct } from "@/components/quote-items-editor";

/** Active catalog products mapped for the quote items editor. */
export async function getCatalogProducts(): Promise<CatalogProduct[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
  });
  return products.map((p) => ({
    id: p.id,
    label: p.brand ? `${p.name} · ${p.brand}` : p.name,
    priceLabel: formatMoney(p.price.toString(), p.currency) ?? "",
    unit: p.unit,
    price: p.price.toString(),
    ivaRate: p.ivaRate.toString(),
  }));
}

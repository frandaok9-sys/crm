import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canViewRecord } from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company";
import { renderQuotePdf, type QuotePdfData } from "@/lib/quote-pdf";
import { Currency } from "@/lib/generated/prisma/enums";

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireActiveUser();

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      client: true,
      owner: { select: { name: true, email: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!quote) return new Response("Presupuesto no encontrado", { status: 404 });
  if (!canViewRecord(user, quote)) {
    return new Response("No autorizado", { status: 403 });
  }

  const settings = await getCompanySettings();

  const data: QuotePdfData = {
    code: quote.code,
    version: quote.version,
    status: quote.status,
    currency: quote.currency === Currency.USD ? "USD" : "ARS",
    issueDate: formatDate(quote.issueDate),
    validUntil: quote.validUntil ? formatDate(quote.validUntil) : null,
    paymentTerms: quote.paymentTerms,
    overallDiscount: quote.overallDiscount.toString(),
    notes: quote.notes,
    ownerName: quote.owner ? quote.owner.name ?? quote.owner.email : null,
    client: {
      legalName: quote.client.legalName,
      taxId: quote.client.taxId,
      address: quote.client.address,
      city: quote.client.city,
      province: quote.client.province,
    },
    company: {
      name: settings?.legalName ?? settings?.tradeName ?? null,
      taxId: settings?.taxId ?? null,
      address: settings?.address ?? null,
      cityLine:
        [settings?.city, settings?.province, settings?.postalCode]
          .filter(Boolean)
          .join(", ") || null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
      website: settings?.website ?? null,
      logo: settings?.logo ?? null,
      footer: settings?.quoteFooter ?? null,
      bankInfo: settings?.bankInfo ?? null,
    },
    items: quote.items.map((it) => ({
      type: it.type,
      description: it.description,
      quantity: it.quantity.toString(),
      unit: it.unit,
      unitPrice: it.unitPrice.toString(),
      discount: it.discount.toString(),
      ivaRate: it.ivaRate.toString(),
      lineNet: it.lineNet.toString(),
    })),
  };

  try {
    const buffer = await renderQuotePdf(data);
    const filename = `${quote.code}${quote.version > 1 ? `-Rev${quote.version}` : ""}.pdf`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Quote PDF render failed:", error);
    return new Response("No se pudo generar el PDF.", { status: 500 });
  }
}

import { describe, it, expect } from "vitest";

import { renderQuotePdf, type QuotePdfData } from "../lib/quote-pdf";
import { QuoteStatus, QuoteItemType } from "../lib/generated/prisma/enums";

const sample: QuotePdfData = {
  code: "PRE-0001",
  version: 2,
  status: QuoteStatus.SENT,
  currency: "ARS",
  issueDate: "09/07/2026",
  validUntil: "08/08/2026",
  paymentTerms: "30 días",
  overallDiscount: "5",
  notes: "Precios sujetos a modificación sin previo aviso.",
  ownerName: "María González",
  client: {
    legalName: "Bodega Norton S.A.",
    taxId: "30-50123456-7",
    address: "Ruta Provincial 15, km 23",
    city: "Luján de Cuyo",
    province: "Mendoza",
  },
  company: {
    name: "RC Pisos Industriales",
    taxId: "30-71234567-8",
    address: "Parque Industrial, Lote 12",
    cityLine: "Mendoza, Argentina",
    phone: "+54 261 555-0000",
    email: "info@rcpisos.com.ar",
    website: "rcpisos.com.ar",
    logo: null,
    footer: "Gracias por su consulta.",
    bankInfo: "Banco Nación · CBU 0110000000000000000000",
  },
  items: [
    {
      type: QuoteItemType.SERVICE,
      description: "Piso epóxico sanitario sala de fraccionamiento",
      quantity: "2500",
      unit: "m²",
      unitPrice: "18500",
      discount: "10",
      ivaRate: "21.00",
      lineNet: "41625000.00",
    },
    {
      type: QuoteItemType.PRODUCT,
      description: "Sellado de juntas perimetrales",
      quantity: "320",
      unit: "ml",
      unitPrice: "4200",
      discount: "0",
      ivaRate: "10.50",
      lineNet: "1344000.00",
    },
  ],
};

describe("renderQuotePdf", () => {
  it("produces a valid PDF document", async () => {
    const buffer = await renderQuotePdf(sample);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders without optional fields (no logo, no notes)", async () => {
    const minimal: QuotePdfData = {
      ...sample,
      version: 1,
      validUntil: null,
      paymentTerms: null,
      overallDiscount: "0",
      notes: null,
      ownerName: null,
      company: {
        name: null,
        taxId: null,
        address: null,
        cityLine: null,
        phone: null,
        email: null,
        website: null,
        logo: null,
        footer: null,
        bankInfo: null,
      },
    };
    const buffer = await renderQuotePdf(minimal);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canCreateQuotes,
  canEditQuote,
  canAssignClients,
  canViewRecord,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { computeQuoteTotals, lineNet } from "@/lib/quotes-calc";
import {
  Currency,
  QuoteStatus,
  QuoteItemType,
} from "@/lib/generated/prisma/enums";

const ITEM_TYPES = Object.values(QuoteItemType) as string[];
const QUOTE_STATUSES = Object.values(QuoteStatus) as string[];

function num(value: unknown): string {
  let s = String(value ?? "").trim().replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  return /^\d+(\.\d+)?$/.test(s) ? s : "0";
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}

const VALID_UNITS = ["m²", "un", "h", "ml", "kg", "global"];

type ParsedItem = {
  type: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  ivaRate: string;
};

function parseItems(formData: FormData): ParsedItem[] {
  const raw = formData.get("items");
  if (typeof raw !== "string") return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((entry) => {
      const r = entry as Record<string, unknown>;
      return {
        type: ITEM_TYPES.includes(String(r.type))
          ? String(r.type)
          : QuoteItemType.PRODUCT,
        description: String(r.description ?? "").trim(),
        quantity: num(r.quantity),
        unit: VALID_UNITS.includes(String(r.unit)) ? String(r.unit) : "m²",
        unitPrice: num(r.unitPrice),
        ivaRate: num(r.ivaRate),
      };
    })
    .filter((r) => r.description.length > 0);
}

function itemCreateData(items: ParsedItem[]) {
  return items.map((it, index) => ({
    type: it.type as QuoteItemType,
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unitPrice: it.unitPrice,
    ivaRate: it.ivaRate,
    lineNet: lineNet(it.quantity, it.unitPrice),
    position: index,
  }));
}

async function resolveClient(userId: string, clientId: string | null) {
  if (!clientId) throw new Error("Elegí un cliente.");
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  const user = await requireActiveUser();
  if (!client || !canViewRecord(user, client)) {
    throw new Error("Cliente inválido.");
  }
  return client;
}

export async function createQuote(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canCreateQuotes(user)) {
    throw new Error("No tenés permisos para crear presupuestos.");
  }

  const clientId = String(formData.get("clientId") ?? "") || null;
  const client = await resolveClient(user.id, clientId);

  const items = parseItems(formData);
  if (items.length === 0) throw new Error("Agregá al menos un ítem.");

  const currency =
    formData.get("currency") === Currency.USD ? Currency.USD : Currency.ARS;
  const totals = computeQuoteTotals(items);
  const ownerId = canAssignClients(user)
    ? (String(formData.get("ownerId") ?? "") || null) ?? client.ownerId
    : user.id;

  const count = await prisma.quote.count({ where: { version: 1 } });
  const code = `PRE-${String(count + 1).padStart(4, "0")}`;

  const quote = await prisma.quote.create({
    data: {
      code,
      clientId: client.id,
      ownerId,
      currency,
      validUntil: parseDate(formData.get("validUntil")),
      notes: String(formData.get("notes") ?? "").trim() || null,
      net: totals.net,
      ivaTotal: totals.ivaTotal,
      total: totals.total,
      items: { create: itemCreateData(items) },
    },
  });

  await logAudit({
    action: "quote.created",
    actorId: user.id,
    targetType: "Quote",
    targetId: quote.id,
    metadata: { code, total: totals.total, currency },
  });
  revalidatePath("/presupuestos");
  redirect(`/presupuestos/${quote.id}`);
}

export async function updateQuote(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) throw new Error("Presupuesto no encontrado.");
  if (!canEditQuote(user, existing)) {
    throw new Error("No tenés permisos para editar este presupuesto.");
  }
  if (existing.status !== QuoteStatus.DRAFT) {
    throw new Error("Solo se pueden editar presupuestos en borrador.");
  }

  const clientId = String(formData.get("clientId") ?? "") || null;
  const client = await resolveClient(user.id, clientId);

  const items = parseItems(formData);
  if (items.length === 0) throw new Error("Agregá al menos un ítem.");

  const currency =
    formData.get("currency") === Currency.USD ? Currency.USD : Currency.ARS;
  const totals = computeQuoteTotals(items);
  const ownerId = canAssignClients(user)
    ? (String(formData.get("ownerId") ?? "") || null) ?? existing.ownerId
    : existing.ownerId;

  await prisma.$transaction(async (tx) => {
    await tx.quoteItem.deleteMany({ where: { quoteId: id } });
    await tx.quote.update({
      where: { id },
      data: {
        clientId: client.id,
        ownerId,
        currency,
        validUntil: parseDate(formData.get("validUntil")),
        notes: String(formData.get("notes") ?? "").trim() || null,
        net: totals.net,
        ivaTotal: totals.ivaTotal,
        total: totals.total,
        items: { create: itemCreateData(items) },
      },
    });
  });

  await logAudit({
    action: "quote.updated",
    actorId: user.id,
    targetType: "Quote",
    targetId: id,
    metadata: { total: totals.total },
  });
  revalidatePath("/presupuestos");
  revalidatePath(`/presupuestos/${id}`);
  redirect(`/presupuestos/${id}`);
}

export async function setQuoteStatus(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!QUOTE_STATUSES.includes(status)) {
    throw new Error("Estado inválido.");
  }
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) throw new Error("Presupuesto no encontrado.");
  if (!canEditQuote(user, existing)) {
    throw new Error("No tenés permisos para modificar este presupuesto.");
  }

  await prisma.quote.update({
    where: { id },
    data: { status: status as QuoteStatus },
  });
  await logAudit({
    action: "quote.status_changed",
    actorId: user.id,
    targetType: "Quote",
    targetId: id,
    metadata: { status },
  });
  revalidatePath("/presupuestos");
  revalidatePath(`/presupuestos/${id}`);
}

export async function reviseQuote(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  const source = await prisma.quote.findUnique({
    where: { id },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!source) throw new Error("Presupuesto no encontrado.");
  if (!canEditQuote(user, source)) {
    throw new Error("No tenés permisos para revisar este presupuesto.");
  }

  const group = source.rootId ?? source.id;

  // Version is computed and written inside one transaction so two rapid
  // clicks can't mint the same revision number twice.
  const revision = await prisma.$transaction(async (tx) => {
    const latest = await tx.quote.findFirst({
      where: { OR: [{ id: group }, { rootId: group }] },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? source.version) + 1;

    return tx.quote.create({
      data: {
        code: source.code,
        version,
        rootId: group,
        clientId: source.clientId,
        ownerId: source.ownerId,
        currency: source.currency,
        validUntil: source.validUntil,
        notes: source.notes,
        net: source.net,
        ivaTotal: source.ivaTotal,
        total: source.total,
        status: QuoteStatus.DRAFT,
        items: {
          create: source.items.map((it) => ({
            type: it.type,
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            ivaRate: it.ivaRate,
            lineNet: it.lineNet,
            position: it.position,
          })),
        },
      },
    });
  });

  await logAudit({
    action: "quote.revised",
    actorId: user.id,
    targetType: "Quote",
    targetId: revision.id,
    metadata: { code: source.code, version: revision.version },
  });
  revalidatePath("/presupuestos");
  redirect(`/presupuestos/${revision.id}`);
}

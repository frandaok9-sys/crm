"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { geocodeOpportunity } from "@/lib/geocode";
import { requireActiveUser } from "@/lib/auth";
import {
  canCreateQuotes,
  canEditQuote,
  canAssignClients,
  canViewRecord,
  canManageLedger,
  canManageProducts,
  canPostTasks,
  canCreateOpportunities,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { defaultTenantId, recordCanonicalEvent } from "@/lib/nexus/central";
import { computeQuoteTotals, lineNet } from "@/lib/quotes-calc";
import { canTransitionQuote, QUOTE_STATUS_LABELS } from "@/lib/quotes";
import { EXECUTION_STAGE } from "@/lib/stages";
import {
  Currency,
  QuoteStatus,
  QuoteItemType,
  LedgerMovementType,
} from "@/lib/generated/prisma/enums";

const ITEM_TYPES = Object.values(QuoteItemType) as string[];
const QUOTE_STATUSES = Object.values(QuoteStatus) as string[];

function num(value: unknown): string {
  let s = String(value ?? "").trim().replace(/[$\s]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Solo puntos en grupos de miles ("1.500" = mil quinientos, no 1,50).
    s = s.replace(/\./g, "");
  }
  return /^\d+(\.\d+)?$/.test(s) ? s : "0";
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}

type ParsedItem = {
  type: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
  ivaRate: string;
};

/** Clamp a percentage string to 0–100. */
function pct(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return "0";
  return n > 100 ? "100" : value;
}

function overallDiscountFrom(formData: FormData): string {
  return pct(num(formData.get("overallDiscount")));
}

function paymentTermsFrom(formData: FormData): string | null {
  return String(formData.get("paymentTerms") ?? "").trim().slice(0, 20) || null;
}

// ---- Fotos por sección del pliego + biblioteca de imágenes ----
/// Secciones que aceptan fotos. "general" = "Fotos de la propuesta".
const PHOTO_SECTIONS = [
  "scope",
  "tasks",
  "exclusions",
  "warranty",
  "conditions",
  "general",
] as const;
const MAX_PHOTOS_PER_SECTION = 8;
// Coherente con el presupuesto compartido del cliente (QuotePhotoBudget).
const MAX_QUOTE_PHOTOS = 20;
// Data URL JPEG comprimida en el navegador (~150-350 KB); tope duro por si
// llega otra cosa: ~1,5 MB de imagen ≈ 2M caracteres base64.
const MAX_PHOTO_CHARS = 2_000_000;
// Peso total de fotos nuevas por guardado (el POST tiene límite de tamaño).
const MAX_TOTAL_PHOTO_CHARS = 4_000_000;

type ParsedPhoto = {
  dataUrl: string;
  caption: string | null;
  section: string;
  saveToLibrary: boolean;
};

/** Lee las fotos nuevas de TODAS las secciones (hidden newPhotos_<sección>). */
function parseNewPhotos(formData: FormData): ParsedPhoto[] {
  const out: ParsedPhoto[] = [];
  for (const section of PHOTO_SECTIONS) {
    const raw = formData.get(`newPhotos_${section}`);
    if (typeof raw !== "string" || !raw) continue;
    let arr: unknown;
    try {
      arr = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;
    if (arr.length > MAX_PHOTOS_PER_SECTION) {
      throw new Error(`Máximo ${MAX_PHOTOS_PER_SECTION} fotos por sección.`);
    }
    for (const entry of arr) {
      const r = entry as Record<string, unknown>;
      const dataUrl = String(r.dataUrl ?? "");
      if (dataUrl.length > MAX_PHOTO_CHARS) {
        throw new Error("Una de las fotos es demasiado grande (máx. ~1,5 MB).");
      }
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
        throw new Error("Una de las fotos no es una imagen válida.");
      }
      out.push({
        dataUrl,
        caption: String(r.caption ?? "").trim().slice(0, 200) || null,
        section,
        saveToLibrary: r.saveToLibrary === true,
      });
    }
  }
  if (out.length > MAX_QUOTE_PHOTOS) {
    throw new Error(`Máximo ${MAX_QUOTE_PHOTOS} fotos por presupuesto.`);
  }
  const totalChars = out.reduce((sum, p) => sum + p.dataUrl.length, 0);
  if (totalChars > MAX_TOTAL_PHOTO_CHARS) {
    throw new Error(
      "Las fotos nuevas pesan demasiado para un solo guardado: guardá y agregá el resto editando el presupuesto."
    );
  }
  return out;
}

/** Ids a borrar, juntando los hidden removePhotoIds_<sección>. */
function parseRemovePhotoIds(formData: FormData): string[] {
  const out: string[] = [];
  for (const section of PHOTO_SECTIONS) {
    const raw = formData.get(`removePhotoIds_${section}`);
    if (typeof raw !== "string" || !raw) continue;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) out.push(...arr.map(String));
    } catch {
      // ignorar
    }
  }
  return out;
}

/**
 * Copia a la biblioteca las fotos marcadas "guardar en biblioteca".
 * Best-effort: el presupuesto ya quedó guardado; un fallo acá no debe
 * hacer creer que falló todo (y un reintento duplicaría el presupuesto).
 * Dedupe por contenido: la misma imagen no se guarda dos veces.
 */
async function saveToLibrary(photos: ParsedPhoto[]): Promise<void> {
  const marked = photos.filter((p) => p.saveToLibrary);
  if (marked.length === 0) return;
  try {
    const existing = await prisma.companyImage.findMany({
      where: { data: { in: marked.map((p) => p.dataUrl) } },
      select: { data: true },
    });
    const known = new Set(existing.map((e) => e.data));
    const fresh = marked.filter((p) => !known.has(p.dataUrl));
    if (fresh.length === 0) return;
    await prisma.companyImage.createMany({
      data: fresh.map((p) => ({
        name: p.caption ?? "Imagen sin nombre",
        data: p.dataUrl,
      })),
    });
  } catch (error) {
    console.error("saveToLibrary failed (presupuesto ya guardado):", error);
  }
}

/** Borra una imagen de la biblioteca (los presupuestos que la usan no se
 * tocan: al insertarla se copia). Solo admins/gerentes/administración —
 * es un recurso compartido de toda la empresa. */
export async function deleteCompanyImage(id: string): Promise<void> {
  const user = await requireActiveUser();
  if (!canManageProducts(user)) {
    throw new Error(
      "Solo administradores o gerentes pueden borrar de la biblioteca."
    );
  }
  const image = await prisma.companyImage.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!image) return; // ya borrada (carrera): no es error
  await prisma.companyImage.deleteMany({ where: { id } });
  await logAudit({
    action: "company_image.deleted",
    actorId: user.id,
    targetType: "CompanyImage",
    targetId: id,
    metadata: { name: image.name },
  });
}

/** Campos del pliego técnico (etapas "Obra y plazos" + "Parte técnica"). */
function pliegoFrom(formData: FormData) {
  const text = (name: string, max: number) =>
    String(formData.get(name) ?? "").trim().slice(0, max) || null;
  return {
    siteTitle: text("siteTitle", 200),
    siteAddress: text("siteAddress", 300),
    deliveryTerm: text("deliveryTerm", 2000),
    scopeText: text("scopeText", 5000),
    taskDescription: text("taskDescription", 10000),
    exclusions: text("exclusions", 5000),
    warrantyText: text("warrantyText", 2000),
    generalConditions: text("generalConditions", 5000),
  };
}

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
        unit: String(r.unit ?? "").trim().slice(0, 12) || "m²",
        unitPrice: num(r.unitPrice),
        discount: pct(num(r.discount)),
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
    discount: it.discount,
    ivaRate: it.ivaRate,
    lineNet: lineNet(it.quantity, it.unitPrice, it.discount),
    position: index,
  }));
}

/**
 * Ids de TODAS las revisiones de un presupuesto (Rev.1, Rev.2…). Un
 * presupuesto es UNA venta: facturarlo, pasarlo a ejecución o borrarlo son
 * decisiones sobre el grupo entero, nunca sobre una revisión suelta.
 */
async function quoteGroupIds(quote: {
  id: string;
  rootId: string | null;
}): Promise<string[]> {
  const group = quote.rootId ?? quote.id;
  const revisions = await prisma.quote.findMany({
    where: { OR: [{ id: group }, { rootId: group }] },
    select: { id: true },
  });
  return revisions.map((r) => r.id);
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
  const overallDiscount = overallDiscountFrom(formData);
  const totals = computeQuoteTotals(items, overallDiscount);
  const ownerId = canAssignClients(user)
    ? (String(formData.get("ownerId") ?? "") || null) ?? client.ownerId
    : user.id;

  const newPhotos = parseNewPhotos(formData);

  const count = await prisma.quote.count({ where: { version: 1 } });
  const code = `PRE-${String(count + 1).padStart(4, "0")}`;
  const tenantId = await defaultTenantId();

  const quote = await prisma.quote.create({
    data: {
      code,
      clientId: client.id,
      ownerId,
      currency,
      validUntil: parseDate(formData.get("validUntil")),
      notes: String(formData.get("notes") ?? "").trim() || null,
      paymentTerms: paymentTermsFrom(formData),
      ...pliegoFrom(formData),
      overallDiscount,
      net: totals.net,
      ivaTotal: totals.ivaTotal,
      total: totals.total,
      tenantId,
      items: { create: itemCreateData(items) },
      photos: {
        create: newPhotos.map((p, i) => ({
          data: p.dataUrl,
          caption: p.caption,
          section: p.section,
          position: i,
        })),
      },
    },
  });
  await saveToLibrary(newPhotos);

  await logAudit({
    action: "quote.created",
    actorId: user.id,
    targetType: "Quote",
    targetId: quote.id,
    metadata: { code, total: totals.total, currency },
  });
  await recordCanonicalEvent({
    tenantId,
    entity: "quote",
    action: "created",
    nexusId: quote.id,
    userId: user.id,
    detail: `${code} · ${currency} ${totals.total}`,
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
  const overallDiscount = overallDiscountFrom(formData);
  const totals = computeQuoteTotals(items, overallDiscount);
  // "Según el cliente / sin asignar" (opción vacía) toma el dueño del
  // cliente, igual que al crear — antes la opción no hacía nada.
  const ownerId = canAssignClients(user)
    ? String(formData.get("ownerId") ?? "").trim() || client.ownerId
    : existing.ownerId;

  const newPhotos = parseNewPhotos(formData);
  const removePhotoIds = parseRemovePhotoIds(formData);

  await prisma.$transaction(async (tx) => {
    // Fotos: primero se quitan las marcadas, después se agregan las nuevas
    // (respetando el tope total por presupuesto).
    if (removePhotoIds.length > 0) {
      await tx.quotePhoto.deleteMany({
        where: { quoteId: id, id: { in: removePhotoIds } },
      });
    }
    if (newPhotos.length > 0) {
      const remaining = await tx.quotePhoto.count({ where: { quoteId: id } });
      if (remaining + newPhotos.length > MAX_QUOTE_PHOTOS) {
        throw new Error(`Máximo ${MAX_QUOTE_PHOTOS} fotos por presupuesto.`);
      }
      // Tope por sección (existentes tras el borrado + nuevas).
      const perSection = await tx.quotePhoto.groupBy({
        by: ["section"],
        where: { quoteId: id },
        _count: { _all: true },
      });
      // SUMANDO por clave: fotos viejas con section NULL y nuevas con
      // "general" son la misma sección (un Map directo del groupBy pisaría
      // una con la otra y el tope sería evadible).
      const bySection = new Map<string, number>();
      for (const g of perSection) {
        const key = g.section ?? "general";
        bySection.set(key, (bySection.get(key) ?? 0) + g._count._all);
      }
      for (const p of newPhotos) {
        bySection.set(p.section, (bySection.get(p.section) ?? 0) + 1);
      }
      if ([...bySection.values()].some((c) => c > MAX_PHOTOS_PER_SECTION)) {
        throw new Error(`Máximo ${MAX_PHOTOS_PER_SECTION} fotos por sección.`);
      }
      const maxPos = await tx.quotePhoto.aggregate({
        where: { quoteId: id },
        _max: { position: true },
      });
      await tx.quotePhoto.createMany({
        data: newPhotos.map((p, i) => ({
          quoteId: id,
          data: p.dataUrl,
          caption: p.caption,
          section: p.section,
          position: (maxPos._max.position ?? -1) + 1 + i,
        })),
      });
    }

    await tx.quoteItem.deleteMany({ where: { quoteId: id } });
    await tx.quote.update({
      where: { id },
      data: {
        clientId: client.id,
        ownerId,
        currency,
        validUntil: parseDate(formData.get("validUntil")),
        notes: String(formData.get("notes") ?? "").trim() || null,
        paymentTerms: paymentTermsFrom(formData),
        ...pliegoFrom(formData),
        overallDiscount,
        net: totals.net,
        ivaTotal: totals.ivaTotal,
        total: totals.total,
        // Editarlo desde el CRM completa el alta rápida: sale de "por completar".
        needsReview: false,
        items: { create: itemCreateData(items) },
      },
    });
  });
  await saveToLibrary(newPhotos);

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

  // Máquina de estados en el servidor: la pantalla muestra solo los botones
  // válidos, pero un pedido armado a mano podía saltearla (p. ej. pasar un
  // Rechazado o Vencido a Aprobado).
  const next = status as QuoteStatus;
  if (!canTransitionQuote(existing.status, next)) {
    throw new Error(
      `No se puede pasar un presupuesto de "${QUOTE_STATUS_LABELS[existing.status]}" a "${QUOTE_STATUS_LABELS[next]}". Creá una nueva revisión.`
    );
  }
  // Un presupuesto cuya validez ya venció no se aprueba: se revisa (Rev.N+1).
  if (
    next === QuoteStatus.APPROVED &&
    existing.validUntil &&
    existing.validUntil < new Date()
  ) {
    throw new Error(
      "La validez de este presupuesto ya venció. Creá una nueva revisión para aprobarlo."
    );
  }

  await prisma.quote.update({
    where: { id },
    // Enviarlo (o cualquier cambio de estado) también lo saca de "por completar".
    data: { status: next, needsReview: false },
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
    include: {
      items: { orderBy: { position: "asc" } },
      photos: { orderBy: { position: "asc" } },
    },
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
        paymentTerms: source.paymentTerms,
        siteTitle: source.siteTitle,
        siteAddress: source.siteAddress,
        deliveryTerm: source.deliveryTerm,
        scopeText: source.scopeText,
        taskDescription: source.taskDescription,
        exclusions: source.exclusions,
        warrantyText: source.warrantyText,
        generalConditions: source.generalConditions,
        overallDiscount: source.overallDiscount,
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
            discount: it.discount,
            ivaRate: it.ivaRate,
            lineNet: it.lineNet,
            position: it.position,
          })),
        },
        photos: {
          create: source.photos.map((p) => ({
            data: p.data,
            caption: p.caption,
            section: p.section,
            position: p.position,
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

/**
 * Invoices an APPROVED quote: creates the INVOICE movement in the client's
 * current account (debit for the quote total, same currency). Guarded against
 * double invoicing and executed inside a transaction.
 */
export async function invoiceQuote(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canManageLedger(user)) {
    throw new Error("No tenés permisos para facturar (rol financiero).");
  }

  const id = String(formData.get("id") ?? "");
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { client: { select: { id: true, ownerId: true } } },
  });
  if (!quote) throw new Error("Presupuesto no encontrado.");
  if (!canViewRecord(user, quote)) throw new Error("No autorizado.");
  if (quote.status !== QuoteStatus.APPROVED) {
    throw new Error("Solo se pueden facturar presupuestos aprobados.");
  }

  // Condición de pago: contado / 10 / 15 / 30 / 45 días → vencimiento.
  const rawTerm = Number(formData.get("termDays"));
  const paymentTermDays = [0, 10, 15, 30, 45].includes(rawTerm) ? rawTerm : 0;
  const now = new Date();
  const dueDate = new Date(now.getTime() + paymentTermDays * 86_400_000);

  // El freno mira TODAS las revisiones: facturar Rev.1 y después Rev.2
  // duplicaría la deuda del cliente en la cuenta corriente.
  const groupIds = await quoteGroupIds(quote);

  const movement = await prisma.$transaction(async (tx) => {
    const existing = await tx.ledgerMovement.findFirst({
      where: { quoteId: { in: groupIds }, type: LedgerMovementType.INVOICE },
    });
    if (existing) {
      throw new Error(
        "Este presupuesto ya fue facturado (en esta u otra de sus revisiones)."
      );
    }
    return tx.ledgerMovement.create({
      data: {
        clientId: quote.clientId,
        type: LedgerMovementType.INVOICE,
        currency: quote.currency,
        amount: quote.total,
        reference: `${quote.code}${quote.version > 1 ? ` Rev.${quote.version}` : ""}`,
        description: "Factura por presupuesto aprobado",
        paymentTermDays,
        dueDate,
        quoteId: id,
        createdById: user.id,
      },
    });
  });

  await logAudit({
    action: "quote.invoiced",
    actorId: user.id,
    targetType: "Quote",
    targetId: id,
    metadata: {
      movementId: movement.id,
      amount: quote.total.toString(),
      currency: quote.currency,
    },
  });
  revalidatePath(`/presupuestos/${id}`);
  revalidatePath(`/clientes/${quote.clientId}/cuenta`);
}

// ---------------------------------------------------------------------------
// Chat de tareas del presupuesto (delegación con prioridad)
// ---------------------------------------------------------------------------

/**
 * Agrega una tarea al chat de un presupuesto. Puede delegarse a un @usuario y
 * lleva prioridad (0=Alta, 1=Media, 2=Baja); queda pineada arriba hasta que se
 * complete (las delegadas, solo cuando el asignado responde y confirma).
 */
export async function addQuoteTask(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const quoteId = String(formData.get("quoteId") ?? "");
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, clientId: true, ownerId: true },
  });
  if (!quote) throw new Error("Presupuesto no encontrado.");
  if (!canViewRecord(user, quote) || !canPostTasks(user)) {
    throw new Error("No tenés permisos para escribir tareas acá.");
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Escribí qué hay que hacer.");

  // Sin campo (o vacío) = prioridad media, no alta: Number("") da 0.
  const rawPriority = formData.get("priority");
  const parsedPriority = rawPriority == null ? NaN : Number(rawPriority);
  const priority = [0, 1, 2].includes(parsedPriority) ? parsedPriority : 1;

  let assignedToId: string | null = null;
  const rawAssignee = String(formData.get("assignedToId") ?? "").trim();
  if (rawAssignee && rawAssignee !== user.id) {
    const assignee = await prisma.user.findUnique({
      where: { id: rawAssignee },
      select: { id: true, status: true },
    });
    if (!assignee || assignee.status !== "ACTIVE") {
      throw new Error("El usuario asignado no existe o no está activo.");
    }
    assignedToId = assignee.id;
  }

  const task = await prisma.clientActivity.create({
    data: {
      clientId: quote.clientId,
      quoteId: quote.id,
      type: "TASK",
      title: title.slice(0, 200),
      priority,
      assignedToId,
      createdById: user.id,
    },
  });
  if (assignedToId) {
    await logAudit({
      action: "task.delegated",
      actorId: user.id,
      targetType: "ClientActivity",
      targetId: task.id,
      metadata: { quoteId: quote.id, clientId: quote.clientId, assignedToId },
    });
  }
  revalidatePath(`/presupuestos/${quote.id}`);
  revalidatePath(`/clientes/${quote.clientId}`);
  revalidatePath("/dashboard");
}

/**
 * Elimina un presupuesto COMPLETO (todas sus revisiones, con ítems, fotos y
 * tareas). IRREVERSIBLE. FRENO contable: si alguna revisión fue facturada a
 * la cuenta corriente, NO se borra — los registros financieros se conservan
 * (regla del proyecto).
 */
export async function deleteQuote(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) throw new Error("Presupuesto no encontrado.");
  if (!canEditQuote(user, quote)) {
    throw new Error("No tenés permisos para eliminar este presupuesto.");
  }

  const ids = await quoteGroupIds(quote);

  // Se borra el GRUPO entero: hay que poder editar TODAS sus revisiones
  // (una revisión puede estar a nombre de otro vendedor).
  const revisions = await prisma.quote.findMany({
    where: { id: { in: ids } },
    select: { id: true, ownerId: true, clientId: true, opportunityId: true },
  });
  if (revisions.some((r) => !canEditQuote(user, r))) {
    throw new Error(
      "Alguna revisión de este presupuesto es de otro vendedor: pedile a un gerente que lo elimine."
    );
  }

  const invoiced = await prisma.ledgerMovement.count({
    where: { quoteId: { in: ids } },
  });
  if (invoiced > 0) {
    throw new Error(
      "Este presupuesto está facturado en la cuenta corriente y no se puede eliminar (los registros contables se conservan)."
    );
  }

  const linkedObra = revisions.find((r) => r.opportunityId)?.opportunityId;
  await prisma.quote.deleteMany({ where: { id: { in: ids } } });
  await logAudit({
    action: "quote.deleted",
    actorId: user.id,
    targetType: "Quote",
    targetId: id,
    metadata: {
      code: quote.code,
      revisions: ids.length,
      clientId: quote.clientId,
    },
  });
  revalidatePath("/presupuestos");
  revalidatePath(`/clientes/${quote.clientId}`);
  revalidatePath("/dashboard");
  if (linkedObra) revalidatePath(`/oportunidades/${linkedObra}`);
  redirect("/presupuestos");
}

/**
 * Pasa un presupuesto APROBADO "a ejecución": crea la obra (una oportunidad
 * en la etapa "En ejecución", con su panel de costos M4) y la vincula al
 * presupuesto. Si ya tiene obra, redirige a ella (idempotente).
 */
export async function startQuoteExecution(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { client: { select: { id: true, ownerId: true, legalName: true } } },
  });
  if (!quote) throw new Error("Presupuesto no encontrado.");
  if (!canEditQuote(user, quote)) {
    throw new Error("No tenés permisos sobre este presupuesto.");
  }
  // Crear la obra es crear una oportunidad: hace falta ese permiso, si no
  // el usuario quedaría con una obra que después no puede tocar.
  if (!canCreateOpportunities(user)) {
    throw new Error(
      "No tenés permisos para crear obras (oportunidades). Pedíselo a un gerente."
    );
  }

  // La obra es del PRESUPUESTO, no de una revisión: si cualquier revisión ya
  // la creó, se va a esa (si no, Rev.1 y Rev.2 crearían dos obras iguales).
  const groupIds = await quoteGroupIds(quote);
  const withObra = await prisma.quote.findFirst({
    where: { id: { in: groupIds }, opportunityId: { not: null } },
    select: { opportunityId: true },
  });
  if (withObra?.opportunityId) {
    redirect(`/oportunidades/${withObra.opportunityId}`);
  }
  if (quote.status !== QuoteStatus.APPROVED) {
    throw new Error("Solo un presupuesto aprobado puede pasar a ejecución.");
  }

  const stage = await prisma.stage.findFirst({
    where: { name: EXECUTION_STAGE },
    orderBy: { position: "asc" }, // determinista si hubiera nombres repetidos
    select: { id: true },
  });
  if (!stage) {
    throw new Error(
      `No existe la etapa "${EXECUTION_STAGE}" en el pipeline (revisala en el Panel de control).`
    );
  }

  const title =
    quote.siteTitle ?? `Obra ${quote.code} · ${quote.client.legalName}`;
  const position = await prisma.opportunity.count({
    where: { stageId: stage.id },
  });
  const obra = await prisma.$transaction(async (tx) => {
    const created = await tx.opportunity.create({
      data: {
        title: title.slice(0, 200),
        clientId: quote.clientId,
        // Nunca sin dueño: una obra sin owner sería invisible para todos
        // los vendedores (solo la verían los que ven toda la cartera).
        ownerId: quote.ownerId ?? quote.client.ownerId ?? user.id,
        stageId: stage.id,
        position,
        currency: quote.currency,
        amount: quote.total,
        siteAddress: quote.siteAddress,
        tenantId: quote.tenantId,
      },
    });
    await tx.quote.update({
      where: { id },
      data: { opportunityId: created.id },
    });
    return created;
  });

  await logAudit({
    action: "quote.execution_started",
    actorId: user.id,
    targetType: "Quote",
    targetId: id,
    metadata: { code: quote.code, opportunityId: obra.id },
  });
  // Ubicar la obra en el mapa (no bloqueante).
  after(() => geocodeOpportunity(obra.id));
  revalidatePath("/oportunidades");
  revalidatePath("/obras");
  revalidatePath("/mapa");
  revalidatePath(`/presupuestos/${id}`);
  revalidatePath(`/clientes/${quote.clientId}`);
  revalidatePath("/dashboard");
  redirect(`/oportunidades/${obra.id}`);
}

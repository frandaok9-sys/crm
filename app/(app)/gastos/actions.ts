"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canLogExpenses, canManageExpenses } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  Currency,
  FiscalKind,
  CostKind,
} from "@/lib/generated/prisma/enums";

/** Comprobante adjunto: mismo tope que el logo de la empresa (base64 en DB). */
const MAX_RECEIPT_BYTES = 800 * 1024;
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function opt(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

/** Importe es-AR o plano → string decimal de 2 posiciones (Decimal, no float). */
function parseAmount(raw: string | null): string {
  if (!raw) throw new Error("El importe es obligatorio.");
  let s = raw.trim().replace(/[$\s]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error("El importe debe ser un número mayor a cero.");
  }
  const dec = new Decimal(s).toDecimalPlaces(2);
  if (dec.lte(0)) throw new Error("El importe debe ser un número mayor a cero.");
  return dec.toFixed(2);
}

/** Registra un gasto (con comprobante opcional). Cualquier rol operativo. */
export async function createExpense(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canLogExpenses(user)) {
    throw new Error("Tu rol es de consulta: no puede cargar gastos.");
  }

  const amount = parseAmount(opt(formData, "amount"));
  const currency =
    formData.get("currency") === Currency.USD ? Currency.USD : Currency.ARS;

  const dateRaw = opt(formData, "date");
  const date = dateRaw ? new Date(`${dateRaw}T12:00:00-03:00`) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Fecha inválida.");

  const categoryId = opt(formData, "categoryId");
  if (!categoryId) throw new Error("Elegí una categoría.");
  const category = await prisma.expenseCategory.findUnique({
    where: { id: categoryId },
  });
  if (!category || !category.isActive) throw new Error("Categoría inválida.");

  // Obra opcional: debe existir (el gasto de obra alimenta el panel por obra).
  const opportunityId = opt(formData, "opportunityId");
  if (opportunityId) {
    const opp = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true },
    });
    if (!opp) throw new Error("Obra inválida.");
  }

  // Comprobante adjunto (foto/PDF), opcional.
  let receipt: string | null = null;
  let receiptType: string | null = null;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (!RECEIPT_TYPES.includes(file.type)) {
      throw new Error("El comprobante debe ser una foto (JPG/PNG/WebP) o un PDF.");
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      throw new Error("El comprobante no puede superar los 800 KB. Sacá la foto en menor calidad.");
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    receipt = `data:${file.type};base64,${bytes.toString("base64")}`;
    receiptType = file.type;
  }

  const fiscalKind =
    formData.get("fiscalKind") === FiscalKind.INTERNAL
      ? FiscalKind.INTERNAL
      : FiscalKind.INVOICED;

  const expense = await prisma.expense.create({
    data: {
      date,
      amount,
      currency,
      categoryId,
      paymentMethod: opt(formData, "paymentMethod"),
      description: opt(formData, "description"),
      fiscalKind,
      opportunityId,
      receipt,
      receiptType,
      createdById: user.id,
    },
  });

  await logAudit({
    action: "expense.created",
    actorId: user.id,
    targetType: "Expense",
    targetId: expense.id,
    metadata: { amount, currency, category: category.name, fiscalKind },
  });
  revalidatePath("/gastos");
  revalidatePath("/finanzas");
}

/** Borra un gasto: su autor, o quien gestiona gastos. */
export async function deleteExpense(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: { id: true, createdById: true, amount: true, currency: true },
  });
  if (!expense) return;
  if (expense.createdById !== user.id && !canManageExpenses(user)) {
    throw new Error("No tenés permisos para borrar este gasto.");
  }
  await prisma.expense.delete({ where: { id } });
  await logAudit({
    action: "expense.deleted",
    actorId: user.id,
    targetType: "Expense",
    targetId: id,
    metadata: { amount: expense.amount.toString(), currency: expense.currency },
  });
  revalidatePath("/gastos");
  revalidatePath("/finanzas");
}

/**
 * M4 — Carga rápida de MANO DE OBRA de una obra: horas × valor hora se
 * registra como un gasto variable asociado a la oportunidad, así alimenta el
 * costo real de la obra y el balance mensual sin doble carga.
 */
export async function addLaborCost(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canLogExpenses(user)) {
    throw new Error("Tu rol es de consulta: no puede cargar costos.");
  }

  const opportunityId = String(formData.get("opportunityId") ?? "");
  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, title: true },
  });
  if (!opp) throw new Error("Obra inválida.");

  const hours = parseAmount(opt(formData, "hours"));
  const rate = parseAmount(opt(formData, "rate"));
  const amount = new Decimal(hours).times(rate).toDecimalPlaces(2).toFixed(2);
  const currency =
    formData.get("currency") === Currency.USD ? Currency.USD : Currency.ARS;
  const fiscalKind =
    formData.get("fiscalKind") === FiscalKind.INTERNAL
      ? FiscalKind.INTERNAL
      : FiscalKind.INVOICED;

  // Categoría "Mano de obra eventual" (semilla); si no está, la primera variable.
  const category =
    (await prisma.expenseCategory.findFirst({
      where: { name: { contains: "mano de obra", mode: "insensitive" }, isActive: true },
    })) ??
    (await prisma.expenseCategory.findFirst({
      where: { kind: CostKind.VARIABLE, isActive: true },
      orderBy: { position: "asc" },
    }));
  if (!category) throw new Error("No hay categorías de costo activas.");

  const detail = opt(formData, "description");
  const expense = await prisma.expense.create({
    data: {
      date: new Date(),
      amount,
      currency,
      categoryId: category.id,
      description: `Mano de obra: ${hours} h × ${rate}${detail ? ` — ${detail}` : ""}`,
      fiscalKind,
      opportunityId,
      createdById: user.id,
    },
  });

  await logAudit({
    action: "expense.created",
    actorId: user.id,
    targetType: "Expense",
    targetId: expense.id,
    metadata: { amount, currency, category: category.name, obra: opp.title, laborHours: hours },
  });
  revalidatePath(`/oportunidades/${opportunityId}`);
  revalidatePath("/gastos");
  revalidatePath("/finanzas");
}

/** Alta de categoría de costo (solo gestión de gastos). */
export async function createExpenseCategory(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canManageExpenses(user)) {
    throw new Error("No tenés permisos para administrar categorías.");
  }
  const name = opt(formData, "name");
  if (!name) throw new Error("El nombre de la categoría es obligatorio.");
  const kind =
    formData.get("kind") === CostKind.FIXED ? CostKind.FIXED : CostKind.VARIABLE;

  const count = await prisma.expenseCategory.count();
  try {
    await prisma.expenseCategory.create({
      data: { name: name.slice(0, 60), kind, position: count },
    });
  } catch {
    throw new Error("Ya existe una categoría con ese nombre.");
  }
  await logAudit({
    action: "expense_category.created",
    actorId: user.id,
    targetType: "ExpenseCategory",
    metadata: { name, kind },
  });
  revalidatePath("/gastos");
}

/** Activa/desactiva una categoría (no se borran: los gastos viejos la referencian). */
export async function toggleExpenseCategory(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canManageExpenses(user)) {
    throw new Error("No tenés permisos para administrar categorías.");
  }
  const id = String(formData.get("id") ?? "");
  const category = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!category) return;
  await prisma.expenseCategory.update({
    where: { id },
    data: { isActive: !category.isActive },
  });
  revalidatePath("/gastos");
}

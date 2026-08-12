"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageLedger, canViewRecord } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { allocateFifo } from "@/lib/ledger-calc";
import {
  Currency,
  LedgerMovementType,
  FiscalKind,
} from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";

const MOVEMENT_TYPES = Object.values(LedgerMovementType) as string[];

// Comprobante adjunto del movimiento (factura escaneada, recibo, orden de
// pago). Mismos formatos que en Gastos, con más margen de tamaño.
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

/** Lee el adjunto del formulario y lo devuelve como data URL. */
async function parseAttachment(formData: FormData): Promise<{
  attachment: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
}> {
  const file = formData.get("attachment");
  if (!(file instanceof File) || file.size === 0) {
    return { attachment: null, attachmentType: null, attachmentName: null };
  }
  if (!ATTACHMENT_TYPES.includes(file.type)) {
    throw new Error(
      "El comprobante debe ser un PDF o una foto (JPG/PNG/WebP)."
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      "El comprobante no puede superar los 4 MB. Comprimí el PDF o sacá la foto en menor calidad."
    );
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return {
    attachment: `data:${file.type};base64,${bytes.toString("base64")}`,
    attachmentType: file.type,
    attachmentName: file.name.slice(0, 200),
  };
}

function opt(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function parseAmount(raw: string | null): string {
  if (!raw) throw new Error("El importe es obligatorio.");
  // Tolerar formatos reales: "$ 1.500", "1.500,50", "1500.50".
  let s = raw.trim().replace(/[$\s]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Solo puntos en grupos de miles ("1.500" = mil quinientos, no 1,50).
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) <= 0) {
    throw new Error("El importe debe ser un número mayor a cero.");
  }
  return s;
}

export async function addMovement(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canManageLedger(user)) {
    throw new Error("No tenés permisos para registrar movimientos.");
  }

  const clientId = String(formData.get("clientId") ?? "");
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || !canViewRecord(user, client)) {
    throw new Error("Cliente inválido.");
  }

  const type = String(formData.get("type") ?? "");
  if (!MOVEMENT_TYPES.includes(type)) throw new Error("Tipo inválido.");

  const currency =
    formData.get("currency") === Currency.USD ? Currency.USD : Currency.ARS;
  const amount = parseAmount(opt(formData, "amount"));
  const dateRaw = opt(formData, "date");
  const date = dateRaw ? new Date(dateRaw) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Fecha inválida.");

  const isCredit =
    type === LedgerMovementType.PAYMENT ||
    type === LedgerMovementType.CREDIT_NOTE;
  const autoAllocate = isCredit && formData.get("autoAllocate") === "on";

  // Condición de pago (solo débitos): contado / 10 / 15 / 30 / 45 días.
  // Define el vencimiento; vencida y sin cobrar dispara la alerta de atraso.
  let paymentTermDays: number | null = null;
  let dueDate: Date | null = null;
  if (!isCredit) {
    const rawTerm = Number(formData.get("termDays"));
    if ([0, 10, 15, 30, 45].includes(rawTerm)) {
      paymentTermDays = rawTerm;
      dueDate = new Date(date.getTime() + rawTerm * 86_400_000);
    }
  }

  // M3: facturado (comprobante fiscal) o "sin factura" (control interno).
  const fiscalKind =
    formData.get("fiscalKind") === FiscalKind.INTERNAL
      ? FiscalKind.INTERNAL
      : FiscalKind.INVOICED;

  // Comprobante adjunto (opcional): se lee ANTES de la transacción.
  const adjunto = await parseAttachment(formData);

  // Movement + FIFO allocation happen in ONE transaction: the balance and
  // the imputations can never be left inconsistent.
  //
  // Aislamiento SERIALIZABLE: dos pagos del mismo cliente cargados a la vez
  // leían ambos la factura como "abierta" y la imputaban de más. Con
  // Serializable, la base rechaza el segundo (conflicto) y acá se reintenta.
  const runOnce = () => prisma.$transaction(async (tx) => {
    const created = await tx.ledgerMovement.create({
      data: {
        clientId,
        type: type as LedgerMovementType,
        currency,
        amount,
        date,
        fiscalKind,
        paymentTermDays,
        dueDate,
        ...adjunto,
        description: opt(formData, "description"),
        reference: opt(formData, "reference"),
        createdById: user.id,
      },
    });

    if (autoAllocate) {
      // Open debits of the same client AND currency, oldest first.
      const debits = await tx.ledgerMovement.findMany({
        where: {
          clientId,
          currency,
          type: {
            in: [LedgerMovementType.INVOICE, LedgerMovementType.DEBIT_NOTE],
          },
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        include: { allocationsAsInvoice: { select: { amount: true } } },
      });
      const open = debits.map((debit) => ({
        id: debit.id,
        remaining: new Decimal(debit.amount.toString())
          .minus(
            debit.allocationsAsInvoice.reduce(
              (sum, a) => sum.plus(a.amount.toString()),
              new Decimal(0)
            )
          )
          .toFixed(2),
      }));
      const allocations = allocateFifo(open, amount);
      if (allocations.length > 0) {
        await tx.paymentAllocation.createMany({
          data: allocations.map((a) => ({
            paymentId: created.id,
            invoiceId: a.invoiceId,
            amount: a.amount,
          })),
        });
      }
    }

    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  let movement: Awaited<ReturnType<typeof runOnce>>;
  for (let attempt = 1; ; attempt++) {
    try {
      movement = await runOnce();
      break;
    } catch (error) {
      // P2034: conflicto de serialización (otro pago concurrente). Reintentar.
      const conflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!conflict || attempt >= 3) throw error;
    }
  }

  await logAudit({
    action: "ledger.movement_created",
    actorId: user.id,
    targetType: "LedgerMovement",
    targetId: movement.id,
    metadata: { clientId, type, currency, amount, fiscalKind },
  });
  revalidatePath(`/clientes/${clientId}/cuenta`);
}

export async function deleteMovement(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canManageLedger(user)) {
    throw new Error("No tenés permisos para eliminar movimientos.");
  }
  const id = String(formData.get("id") ?? "");
  const movement = await prisma.ledgerMovement.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!movement) return;
  if (!canViewRecord(user, movement.client)) {
    throw new Error("No autorizado.");
  }

  await prisma.$transaction((tx) =>
    tx.ledgerMovement.delete({ where: { id } })
  );
  await logAudit({
    action: "ledger.movement_deleted",
    actorId: user.id,
    targetType: "LedgerMovement",
    targetId: id,
    metadata: { clientId: movement.clientId },
  });
  revalidatePath(`/clientes/${movement.clientId}/cuenta`);
}

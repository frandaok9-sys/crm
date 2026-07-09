"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageLedger, canViewRecord } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  Currency,
  LedgerMovementType,
} from "@/lib/generated/prisma/enums";

const MOVEMENT_TYPES = Object.values(LedgerMovementType) as string[];

function opt(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function parseAmount(raw: string | null): string {
  if (!raw) throw new Error("El importe es obligatorio.");
  let s = raw.trim().replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
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

  // Written inside a transaction so the derived balance can never be left
  // inconsistent (and to stay atomic with any future related writes).
  const movement = await prisma.$transaction((tx) =>
    tx.ledgerMovement.create({
      data: {
        clientId,
        type: type as LedgerMovementType,
        currency,
        amount,
        date,
        description: opt(formData, "description"),
        reference: opt(formData, "reference"),
        createdById: user.id,
      },
    })
  );

  await logAudit({
    action: "ledger.movement_created",
    actorId: user.id,
    targetType: "LedgerMovement",
    targetId: movement.id,
    metadata: { clientId, type, currency, amount },
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

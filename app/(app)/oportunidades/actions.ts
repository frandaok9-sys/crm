"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canCreateOpportunities,
  canEditOpportunity,
  canAssignClients,
  canViewRecord,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { Currency } from "@/lib/generated/prisma/enums";

function opt(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

/** Parses a user-entered amount (es-AR or plain) into a decimal string. */
function parseAmount(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error("El monto no es válido. Usá solo números, por ejemplo 1500.50");
  }
  return s;
}

async function requireEditableOpportunity(id: string) {
  const user = await requireActiveUser();
  const opportunity = await prisma.opportunity.findUnique({ where: { id } });
  if (!opportunity) throw new Error("Oportunidad no encontrada.");
  if (!canEditOpportunity(user, opportunity)) {
    throw new Error("No tenés permisos para modificar esta oportunidad.");
  }
  return { user, opportunity };
}

export async function createOpportunity(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canCreateOpportunities(user)) {
    throw new Error("No tenés permisos para crear oportunidades.");
  }

  const title = opt(formData, "title");
  if (!title) throw new Error("El título es obligatorio.");

  const clientId = opt(formData, "clientId");
  if (!clientId) throw new Error("Elegí un cliente.");
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || !canViewRecord(user, client)) {
    throw new Error("Cliente inválido.");
  }

  const stageId = opt(formData, "stageId");
  if (!stageId) throw new Error("Elegí una etapa.");

  const currency =
    opt(formData, "currency") === Currency.USD ? Currency.USD : Currency.ARS;
  const amount = parseAmount(opt(formData, "amount"));

  // Managers/admins may assign to any owner; a salesperson keeps it as theirs.
  const ownerId = canAssignClients(user)
    ? opt(formData, "ownerId") ?? client.ownerId
    : user.id;

  const position = await prisma.opportunity.count({ where: { stageId } });

  const opportunity = await prisma.opportunity.create({
    data: {
      title,
      clientId,
      stageId,
      ownerId,
      currency,
      amount,
      notes: opt(formData, "notes"),
      position,
    },
  });

  await logAudit({
    action: "opportunity.created",
    actorId: user.id,
    targetType: "Opportunity",
    targetId: opportunity.id,
    metadata: { title },
  });
  revalidatePath("/oportunidades");
  redirect("/oportunidades");
}

/** Persists a drag: sets the moved card's stage and reorders the target column. */
export async function moveOpportunity(
  movedId: string,
  toStageId: string,
  orderedIds: string[]
): Promise<void> {
  const { user } = await requireEditableOpportunity(movedId);

  await prisma.$transaction([
    prisma.opportunity.update({
      where: { id: movedId },
      data: { stageId: toStageId },
    }),
    ...orderedIds.map((id, index) =>
      prisma.opportunity.update({
        where: { id },
        data: { position: index, stageId: toStageId },
      })
    ),
  ]);

  await logAudit({
    action: "opportunity.moved",
    actorId: user.id,
    targetType: "Opportunity",
    targetId: movedId,
    metadata: { toStageId },
  });
  revalidatePath("/oportunidades");
}

export async function togglePin(id: string): Promise<void> {
  const { user, opportunity } = await requireEditableOpportunity(id);
  await prisma.opportunity.update({
    where: { id },
    data: { isPinned: !opportunity.isPinned },
  });
  await logAudit({
    action: "opportunity.pin_toggled",
    actorId: user.id,
    targetType: "Opportunity",
    targetId: id,
    metadata: { isPinned: !opportunity.isPinned },
  });
  revalidatePath("/oportunidades");
}

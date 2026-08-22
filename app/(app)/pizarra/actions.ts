"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Pizarra (M6): tableros libres para presentaciones y bajada de ideas.
 * Reglas: la edita su dueño; compartida = toda la empresa la ve (solo
 * lectura) y puede duplicarla para trabajar sobre una copia propia.
 */

/** Tope del documento del lienzo (incluye imágenes pegadas en base64). */
const MAX_DOC_CHARS = 6_000_000;

function cleanTitle(raw: unknown): string {
  const t = String(raw ?? "").trim().replace(/\s+/g, " ");
  return (t || "Pizarra sin título").slice(0, 120);
}

export async function createBoard(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const board = await prisma.board.create({
    data: { title: cleanTitle(formData.get("title")), ownerId: user.id },
  });
  await logAudit({
    action: "board.created",
    actorId: user.id,
    targetType: "Board",
    targetId: board.id,
    metadata: { title: board.title },
  });
  revalidatePath("/pizarra");
  redirect(`/pizarra/${board.id}`);
}

/** Guardado automático del lienzo (solo el dueño). Devuelve la hora guardada. */
export async function saveBoard(id: string, data: unknown): Promise<{ savedAt: string }> {
  const user = await requireActiveUser();
  const board = await prisma.board.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!board) throw new Error("Pizarra no encontrada.");
  if (board.ownerId !== user.id) throw new Error("Solo el dueño puede editar esta pizarra.");

  const json = JSON.stringify(data ?? {});
  if (json.length > MAX_DOC_CHARS) {
    throw new Error("La pizarra es demasiado pesada (probá con imágenes más chicas).");
  }
  const saved = await prisma.board.update({
    where: { id },
    data: { data: JSON.parse(json) as Prisma.InputJsonValue },
    select: { updatedAt: true },
  });
  return { savedAt: saved.updatedAt.toISOString() };
}

export async function renameBoard(id: string, title: string): Promise<void> {
  const user = await requireActiveUser();
  const board = await prisma.board.findUnique({ where: { id }, select: { ownerId: true } });
  if (!board) throw new Error("Pizarra no encontrada.");
  if (board.ownerId !== user.id) throw new Error("Solo el dueño puede renombrar esta pizarra.");
  await prisma.board.update({ where: { id }, data: { title: cleanTitle(title) } });
  revalidatePath("/pizarra");
  revalidatePath(`/pizarra/${id}`);
}

/** Compartir con toda la empresa (solo lectura) / volver a privada. */
export async function toggleBoardShare(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  const board = await prisma.board.findUnique({ where: { id }, select: { ownerId: true, isShared: true, title: true } });
  if (!board) throw new Error("Pizarra no encontrada.");
  if (board.ownerId !== user.id) throw new Error("Solo el dueño puede compartir esta pizarra.");
  await prisma.board.update({ where: { id }, data: { isShared: !board.isShared } });
  await logAudit({
    action: board.isShared ? "board.unshared" : "board.shared",
    actorId: user.id,
    targetType: "Board",
    targetId: id,
    metadata: { title: board.title },
  });
  revalidatePath("/pizarra");
  revalidatePath(`/pizarra/${id}`);
}

/** Copia propia de una pizarra (la mía o una compartida). */
export async function duplicateBoard(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  const source = await prisma.board.findUnique({ where: { id } });
  if (!source) throw new Error("Pizarra no encontrada.");
  if (source.ownerId !== user.id && !source.isShared) throw new Error("No tenés acceso a esta pizarra.");
  const copy = await prisma.board.create({
    data: {
      title: `${source.title} (copia)`.slice(0, 120),
      data: (source.data ?? undefined) as Prisma.InputJsonValue | undefined,
      ownerId: user.id,
    },
  });
  revalidatePath("/pizarra");
  redirect(`/pizarra/${copy.id}`);
}

export async function deleteBoard(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  const board = await prisma.board.findUnique({ where: { id }, select: { ownerId: true, title: true } });
  if (!board) return;
  if (board.ownerId !== user.id) throw new Error("Solo el dueño puede borrar esta pizarra.");
  await prisma.board.delete({ where: { id } });
  await logAudit({
    action: "board.deleted",
    actorId: user.id,
    targetType: "Board",
    targetId: id,
    metadata: { title: board.title },
  });
  revalidatePath("/pizarra");
  redirect("/pizarra");
}

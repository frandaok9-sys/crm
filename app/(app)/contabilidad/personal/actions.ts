"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canAccessSensitiveAccounting } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { StaffArea, UserStatus } from "@/lib/generated/prisma/enums";

/**
 * Personal de la empresa (M5): listado de quiénes pueden generar gastos y a
 * quiénes se les paga sueldo, separado por gerencia / administración /
 * empleados. Solo lo administra quien gestiona finanzas.
 */

function parseArea(raw: FormDataEntryValue | null): StaffArea {
  const v = String(raw ?? "");
  return (Object.values(StaffArea) as string[]).includes(v)
    ? (v as StaffArea)
    : StaffArea.EMPLOYEE;
}

function cleanName(raw: FormDataEntryValue | null): string {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new Error("El nombre es obligatorio.");
  return name.slice(0, 80);
}

async function requireFinance() {
  const user = await requireActiveUser();
  if (!canAccessSensitiveAccounting(user)) {
    throw new Error("No tenés permiso para la contabilidad reservada (personal).");
  }
  return user;
}

function touch() {
  revalidatePath("/contabilidad/personal");
  revalidatePath("/contabilidad/sueldos");
  revalidatePath("/contabilidad/gastos");
}

export async function createPerson(formData: FormData): Promise<void> {
  const user = await requireFinance();
  const name = cleanName(formData.get("name"));
  const area = parseArea(formData.get("area"));
  const canSpend = formData.get("canSpend") === "on";
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 200) || null;

  const person = await prisma.person.create({
    data: { name, area, canSpend, notes },
  });
  await logAudit({
    action: "person.created",
    actorId: user.id,
    targetType: "Person",
    targetId: person.id,
    metadata: { name, area, canSpend },
  });
  touch();
}

/**
 * Alta desde un usuario del sistema: toma su nombre y lo deja VINCULADO (una
 * sola ficha por usuario). Así no hay que tipearlo de nuevo y, al cargar un
 * gasto, el sistema propone a esa persona como "quién gastó".
 */
export async function createPersonFromUser(formData: FormData): Promise<void> {
  const admin = await requireFinance();
  const userId = String(formData.get("userId") ?? "");
  const area = parseArea(formData.get("area"));
  const canSpend = formData.get("canSpend") === "on";

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, status: true, person: { select: { id: true } } },
  });
  if (!target || target.status !== UserStatus.ACTIVE) {
    throw new Error("Elegí un usuario activo del sistema.");
  }
  if (target.person) {
    throw new Error("Ese usuario ya está en el listado de personal.");
  }

  const person = await prisma.person.create({
    data: {
      name: cleanName(target.name ?? target.email),
      area,
      canSpend,
      userId: target.id,
    },
  });
  await logAudit({
    action: "person.created",
    actorId: admin.id,
    targetType: "Person",
    targetId: person.id,
    metadata: { name: person.name, area, canSpend, fromUserId: target.id },
  });
  touch();
}

/** Renombrar / cambiar de área / notas. */
export async function updatePerson(formData: FormData): Promise<void> {
  const user = await requireFinance();
  const id = String(formData.get("id") ?? "");
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) throw new Error("Persona no encontrada.");

  const name = cleanName(formData.get("name"));
  const area = parseArea(formData.get("area"));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 200) || null;

  await prisma.person.update({ where: { id }, data: { name, area, notes } });
  await logAudit({
    action: "person.updated",
    actorId: user.id,
    targetType: "Person",
    targetId: id,
    metadata: { antes: { name: person.name, area: person.area }, name, area },
  });
  touch();
}

/** Autorizar / quitar la autorización para gastar dinero de la empresa. */
export async function togglePersonCanSpend(formData: FormData): Promise<void> {
  const user = await requireFinance();
  const id = String(formData.get("id") ?? "");
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return;
  await prisma.person.update({
    where: { id },
    data: { canSpend: !person.canSpend },
  });
  await logAudit({
    action: "person.can_spend_changed",
    actorId: user.id,
    targetType: "Person",
    targetId: id,
    metadata: { name: person.name, canSpend: !person.canSpend },
  });
  touch();
}

/**
 * Baja / reincorporación. No se borra: sus sueldos y gastos históricos la
 * siguen referenciando.
 */
export async function togglePersonActive(formData: FormData): Promise<void> {
  const user = await requireFinance();
  const id = String(formData.get("id") ?? "");
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return;
  await prisma.person.update({
    where: { id },
    data: { isActive: !person.isActive },
  });
  await logAudit({
    action: person.isActive ? "person.deactivated" : "person.reactivated",
    actorId: user.id,
    targetType: "Person",
    targetId: id,
    metadata: { name: person.name },
  });
  touch();
}

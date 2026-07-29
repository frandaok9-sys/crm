"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  hashPassword,
  verifyPassword,
  passwordPolicyError,
} from "@/lib/password";

/**
 * Cambio de contraseña del PROPIO usuario. Si ya tiene contraseña, exige la
 * actual; si nunca tuvo (entra con Google), puede crearse una como acceso
 * alternativo. Nunca se guarda ni se registra el texto plano.
 */
export async function changePassword(formData: FormData): Promise<void> {
  const user = await requireActiveUser();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fail = (reason: string) => redirect(`/cuenta?error=${reason}`);

  if (next !== confirm) fail("confirm");
  const policy = passwordPolicyError(next);
  if (policy) fail("policy");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  // Con contraseña previa: verificar la actual antes de cambiarla.
  if (dbUser?.passwordHash && !verifyPassword(current, dbUser.passwordHash)) {
    fail("current");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(next) },
  });
  await logAudit({
    action: "user.password_changed",
    actorId: user.id,
    targetType: "User",
    targetId: user.id,
  });
  redirect("/cuenta?ok=1");
}

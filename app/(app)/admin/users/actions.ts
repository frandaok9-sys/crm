"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canManageUsers,
  ROLE_DEFAULT_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  type PermissionKey,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { hashPassword, passwordPolicyError } from "@/lib/password";
import { Role, UserStatus } from "@/lib/generated/prisma/enums";

const VALID_ROLES = Object.values(Role) as string[];

async function requireAdmin() {
  const user = await requireActiveUser();
  if (!canManageUsers(user)) {
    throw new Error("No tenés permisos para administrar usuarios.");
  }
  return user;
}

function parseRole(value: FormDataEntryValue | null): Role {
  const role = String(value ?? "");
  if (!VALID_ROLES.includes(role)) {
    throw new Error("Rol inválido.");
  }
  return role as Role;
}

/** Activate a pending user and assign an initial role. */
export async function activateUser(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = parseRole(formData.get("role"));

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      role,
      status: UserStatus.ACTIVE,
      permissions: ROLE_DEFAULT_PERMISSIONS[role],
    },
  });

  await logAudit({
    action: "user.activated",
    actorId: admin.id,
    targetType: "User",
    targetId: userId,
    metadata: { role, email: user.email },
  });
  revalidatePath("/admin/users");
}

/** Change the role of an existing user. */
export async function changeUserRole(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = parseRole(formData.get("role"));

  if (userId === admin.id) {
    throw new Error("No podés cambiar tu propio rol.");
  }

  // Cambiar el rol restablece los permisos al paquete de ese rol.
  const user = await prisma.user.update({
    where: { id: userId },
    data: { role, permissions: ROLE_DEFAULT_PERMISSIONS[role] },
  });

  await logAudit({
    action: "user.role_changed",
    actorId: admin.id,
    targetType: "User",
    targetId: userId,
    metadata: { role, email: user.email },
  });
  revalidatePath("/admin/users");
}

/** Enable or disable a user account. */
export async function setUserStatus(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (status !== UserStatus.ACTIVE && status !== UserStatus.DISABLED) {
    throw new Error("Estado inválido.");
  }
  if (userId === admin.id) {
    throw new Error("No podés cambiar el estado de tu propia cuenta.");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: status as UserStatus },
  });

  await logAudit({
    action: status === UserStatus.DISABLED ? "user.disabled" : "user.enabled",
    actorId: admin.id,
    targetType: "User",
    targetId: userId,
    metadata: { email: user.email },
  });
  revalidatePath("/admin/users");
}

/**
 * Alta manual de un usuario con contraseña (para gente SIN cuenta de Google,
 * p. ej. emails @rcpisosindustriales.com.ar). Nace ACTIVO con su rol y el
 * paquete de permisos correspondiente. La contraseña se guarda hasheada.
 */
export async function createPasswordUser(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = parseRole(formData.get("role"));

  if (!name) throw new Error("El nombre es obligatorio.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("El email no es válido.");
  }
  const policy = passwordPolicyError(password);
  if (policy) throw new Error(policy);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("Ya existe un usuario con ese email.");

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      status: UserStatus.ACTIVE,
      permissions: ROLE_DEFAULT_PERMISSIONS[role],
      passwordHash: hashPassword(password),
    },
  });

  await logAudit({
    action: "user.created",
    actorId: admin.id,
    targetType: "User",
    targetId: user.id,
    metadata: { email, role, method: "password" },
  });
  revalidatePath("/admin");
}

/** Restablece (o crea) la contraseña de un usuario. Solo administradores. */
export async function setUserPassword(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");

  const policy = passwordPolicyError(password);
  if (policy) throw new Error(policy);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(password) },
  });

  await logAudit({
    action: "user.password_reset",
    actorId: admin.id,
    targetType: "User",
    targetId: userId,
    metadata: { email: user.email },
  });
  revalidatePath(`/admin/users/${userId}`);
}

/** Save a user's individual permission set (checkboxes from the editor). */
export async function updateUserPermissions(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  // Only known permission keys are accepted.
  const requested = formData
    .getAll("perm")
    .map(String)
    .filter((key): key is PermissionKey =>
      (ALL_PERMISSION_KEYS as string[]).includes(key)
    );

  const user = await prisma.user.update({
    where: { id: userId },
    data: { permissions: requested },
  });

  await logAudit({
    action: "user.permissions_changed",
    actorId: admin.id,
    targetType: "User",
    targetId: userId,
    metadata: { email: user.email, permissions: requested },
  });
  revalidatePath("/admin");
  redirect("/admin");
}

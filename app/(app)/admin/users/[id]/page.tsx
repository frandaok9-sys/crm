import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canManageUsers,
  PERMISSIONS,
  ROLE_LABELS,
} from "@/lib/permissions";
import { Role } from "@/lib/generated/prisma/enums";
import { SubmitButton } from "@/components/submit-button";
import { updateUserPermissions } from "../actions";

export default async function UserPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireActiveUser();
  if (!canManageUsers(admin)) redirect("/dashboard");

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();

  const isAdminUser = user.role === Role.ADMIN;
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
          ← Volver al Panel de Control
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Permisos de {user.name ?? user.email}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Rol: {user.role ? ROLE_LABELS[user.role] : "Sin rol"} · {user.email}
        </p>
      </div>

      {isAdminUser ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-zinc-500 dark:bg-zinc-900">
          Los <strong>Administradores</strong> tienen todos los permisos
          siempre. Para limitar a esta persona, cambiale primero el rol desde
          la pestaña Usuarios.
        </div>
      ) : (
        <form action={updateUserPermissions} className="space-y-4">
          <input type="hidden" name="userId" value={user.id} />

          {groups.map((group) => (
            <section
              key={group}
              className="rounded-xl border bg-white p-5 dark:bg-zinc-900"
            >
              <h2 className="mb-3 text-sm font-medium text-zinc-500">
                {group}
              </h2>
              <div className="space-y-3">
                {PERMISSIONS.filter((p) => p.group === group).map(
                  (permission) => (
                    <label
                      key={permission.key}
                      className="flex cursor-pointer items-start gap-3"
                    >
                      <input
                        type="checkbox"
                        name="perm"
                        value={permission.key}
                        defaultChecked={user.permissions.includes(
                          permission.key
                        )}
                        className="mt-1 h-4 w-4 accent-[var(--primary)]"
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {permission.label}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          {permission.help}
                        </span>
                      </span>
                    </label>
                  )
                )}
              </div>
            </section>
          ))}

          <p className="text-xs text-zinc-500">
            💡 Al cambiar el rol de un usuario, sus permisos se restablecen al
            paquete de ese rol. Los ajustes hechos acá aplican al instante.
          </p>

          <div className="flex justify-end">
            <SubmitButton pendingText="Guardando…">
              Guardar permisos
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

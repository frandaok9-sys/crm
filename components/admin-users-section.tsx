import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/permissions";
import { Role, UserStatus } from "@/lib/generated/prisma/enums";
import { TintBadge, type TintVariant } from "@/components/tint-badge";
import { InitialsAvatar } from "@/components/initials-avatar";
import { SubmitButton } from "@/components/submit-button";
import {
  activateUser,
  changeUserRole,
  setUserStatus,
} from "@/app/(app)/admin/users/actions";

const GRID = "grid grid-cols-[2.4fr_1.2fr_1fr_1.8fr] items-center";

const STATUS_META: Record<UserStatus, { label: string; variant: TintVariant }> =
  {
    [UserStatus.ACTIVE]: { label: "Activo", variant: "green" },
    [UserStatus.PENDING]: { label: "Pendiente", variant: "amber" },
    [UserStatus.DISABLED]: { label: "Deshabilitado", variant: "gray" },
  };

function RoleSelect({ defaultValue }: { defaultValue?: Role }) {
  return (
    <select
      name="role"
      defaultValue={defaultValue ?? Role.SALES}
      className="rounded-[8px] border border-border bg-field px-2 py-1.5 text-xs"
    >
      {Object.values(Role).map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}

export async function AdminUsersSection({ adminId }: { adminId: string }) {
  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  const pendingCount = users.filter(
    (u) => u.status === UserStatus.PENDING
  ).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {pendingCount > 0
          ? `${pendingCount} usuario(s) pendiente(s) de activación.`
          : "No hay usuarios pendientes."}
      </p>

      <section className="overflow-hidden rounded-[12px] border bg-card">
        <div
          className={`${GRID} border-b border-border2 bg-card2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground`}
        >
          <span>Usuario</span>
          <span>Rol</span>
          <span>Estado</span>
          <span className="text-right">Acciones</span>
        </div>

        {users.map((user) => {
          const isSelf = user.id === adminId;
          const status = STATUS_META[user.status];
          const displayName = user.name ?? user.email ?? "";
          return (
            <div
              key={user.id}
              className={`${GRID} border-b border-border2 px-5 py-[13px] text-[13px] transition-colors last:border-0 hover:bg-hoverbg`}
            >
              <span className="flex min-w-0 items-center gap-2.5 pr-3">
                <InitialsAvatar name={displayName} size={30} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-bold">
                    {user.name ?? "—"}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {user.email}
                  </span>
                </span>
              </span>
              <span className="text-text2">
                {user.role ? ROLE_LABELS[user.role] : "—"}
              </span>
              <span>
                <TintBadge variant={status.variant}>{status.label}</TintBadge>
              </span>
              <span className="flex items-center justify-end gap-2.5">
                {isSelf ? (
                  <span className="text-xs text-muted2">Vos</span>
                ) : (
                  <>
                    {user.status === UserStatus.PENDING && (
                      <form
                        action={activateUser}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <RoleSelect />
                        <SubmitButton
                          size="sm"
                          variant="ghost"
                          pendingText="…"
                          className="h-auto p-0 text-[12.5px] font-bold text-primary hover:bg-transparent hover:underline"
                        >
                          Activar
                        </SubmitButton>
                      </form>
                    )}

                    {user.status === UserStatus.ACTIVE && (
                      <>
                        <form
                          action={changeUserRole}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="userId" value={user.id} />
                          <RoleSelect defaultValue={user.role ?? undefined} />
                          <SubmitButton
                            size="sm"
                            variant="ghost"
                            pendingText="…"
                            className="h-auto p-0 text-[12.5px] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                          >
                            Guardar
                          </SubmitButton>
                        </form>
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="text-[12.5px] font-semibold text-primary hover:underline"
                        >
                          Permisos
                        </Link>
                        <form action={setUserStatus}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={UserStatus.DISABLED}
                          />
                          <SubmitButton
                            size="sm"
                            variant="ghost"
                            pendingText="…"
                            className="h-auto p-0 text-[12.5px] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                          >
                            Deshabilitar
                          </SubmitButton>
                        </form>
                      </>
                    )}

                    {user.status === UserStatus.DISABLED && (
                      <form action={setUserStatus}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={UserStatus.ACTIVE}
                        />
                        <SubmitButton
                          size="sm"
                          variant="ghost"
                          pendingText="…"
                          className="h-auto p-0 text-[12.5px] font-bold text-primary hover:bg-transparent hover:underline"
                        >
                          Rehabilitar
                        </SubmitButton>
                      </form>
                    )}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}

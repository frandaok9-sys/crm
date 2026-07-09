import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/permissions";
import { Role, UserStatus } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import {
  activateUser,
  changeUserRole,
  setUserStatus,
} from "@/app/(app)/admin/users/actions";

const STATUS_STYLES: Record<UserStatus, { label: string; className: string }> = {
  [UserStatus.PENDING]: {
    label: "Pendiente",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  [UserStatus.ACTIVE]: {
    label: "Activo",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  [UserStatus.DISABLED]: {
    label: "Deshabilitado",
    className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

function StatusBadge({ status }: { status: UserStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}

function RoleSelect({ defaultValue }: { defaultValue?: Role }) {
  return (
    <select
      name="role"
      defaultValue={defaultValue ?? Role.SALES}
      className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
    <div>
      <p className="mb-4 text-sm text-zinc-500">
        {pendingCount > 0
          ? `${pendingCount} usuario(s) pendiente(s) de activación.`
          : "No hay usuarios pendientes."}
      </p>

      <div className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === adminId;
              return (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{user.name ?? "—"}</div>
                    <div className="text-xs text-zinc-500">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {user.role ? ROLE_LABELS[user.role] : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-xs text-zinc-400">Vos</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {user.status === UserStatus.PENDING && (
                          <form
                            action={activateUser}
                            className="flex items-center gap-2"
                          >
                            <input type="hidden" name="userId" value={user.id} />
                            <RoleSelect />
                            <Button type="submit" size="sm">
                              Activar
                            </Button>
                          </form>
                        )}

                        {user.status === UserStatus.ACTIVE && (
                          <>
                            <form
                              action={changeUserRole}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="hidden"
                                name="userId"
                                value={user.id}
                              />
                              <RoleSelect defaultValue={user.role ?? undefined} />
                              <Button type="submit" size="sm" variant="outline">
                                Guardar rol
                              </Button>
                            </form>
                            <form action={setUserStatus}>
                              <input
                                type="hidden"
                                name="userId"
                                value={user.id}
                              />
                              <input
                                type="hidden"
                                name="status"
                                value={UserStatus.DISABLED}
                              />
                              <Button type="submit" size="sm" variant="ghost">
                                Deshabilitar
                              </Button>
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
                            <Button type="submit" size="sm" variant="outline">
                              Rehabilitar
                            </Button>
                          </form>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

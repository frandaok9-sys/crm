import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { changePassword } from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

const ERRORS: Record<string, string> = {
  confirm: "Las contraseñas nuevas no coinciden.",
  policy: "La contraseña debe tener al menos 8 caracteres y combinar letras y números.",
  current: "La contraseña actual no es correcta.",
};

/** Mi cuenta: datos propios + cambio de contraseña (autogestión). */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const user = await requireActiveUser();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, email: true, passwordHash: true },
  });
  const hasPassword = Boolean(dbUser?.passwordHash);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight">Mi cuenta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dbUser?.name ?? dbUser?.email} ·{" "}
          {user.role ? ROLE_LABELS[user.role] : "Sin rol"}
        </p>
      </div>

      <section className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-medium text-zinc-500">
          {hasPassword ? "Cambiar contraseña" : "Crear contraseña"}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {hasPassword
            ? "Tu acceso con email y contraseña. También podés seguir entrando con Google si tu email es de Google."
            : "Hoy entrás con Google. Si querés, podés crear una contraseña como acceso alternativo."}
        </p>

        {ok && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            ✓ Contraseña actualizada.
          </p>
        )}
        {error && ERRORS[error] && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {ERRORS[error]}
          </p>
        )}

        <form action={changePassword} className="space-y-3">
          {hasPassword && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Contraseña actual *
              </span>
              <input
                type="password"
                name="current"
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Contraseña nueva * (mín. 8, letras y números)
            </span>
            <input
              type="password"
              name="next"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Repetir contraseña nueva *
            </span>
            <input
              type="password"
              name="confirm"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
          <div className="flex justify-end">
            <Button type="submit">
              {hasPassword ? "Cambiar contraseña" : "Crear contraseña"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

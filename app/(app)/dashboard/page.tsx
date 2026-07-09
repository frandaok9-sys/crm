import { requireActiveUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";

export default async function DashboardPage() {
  const user = await requireActiveUser();
  const roleLabel = user.role ? ROLE_LABELS[user.role] : "Sin rol";

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Hola, {user.name ?? user.email}
      </h1>
      <p className="mt-2 text-zinc-500">
        Ingresaste como <span className="font-medium">{roleLabel}</span>.
      </p>

      <div className="mt-8 rounded-xl border bg-white p-6 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500">Próximamente</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Acá vamos a construir, paso a paso: panel de administración de
          usuarios, cuentas y contactos, pipeline de oportunidades, presupuestos,
          cuenta corriente y métricas.
        </p>
      </div>
    </div>
  );
}

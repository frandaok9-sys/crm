import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { UserStatus } from "@/lib/generated/prisma/enums";
import { AdminTabs } from "@/components/admin-tabs";
import { AdminUsersSection } from "@/components/admin-users-section";
import { AdminCompanySection } from "@/components/admin-company-section";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white p-4 dark:bg-zinc-900">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

export default async function AdminPage() {
  const admin = await requireActiveUser();
  if (!canManageUsers(admin)) redirect("/dashboard");

  const [activeUsers, pendingUsers, clients, opportunities, quotes] =
    await Promise.all([
      prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      prisma.user.count({ where: { status: UserStatus.PENDING } }),
      prisma.client.count(),
      prisma.opportunity.count(),
      prisma.quote.count(),
    ]);

  const resumen = (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Usuarios activos" value={activeUsers} />
        <Stat label="Usuarios pendientes" value={pendingUsers} />
        <Stat label="Clientes" value={clients} />
        <Stat label="Oportunidades" value={opportunities} />
        <Stat label="Presupuestos" value={quotes} />
      </div>
      {pendingUsers > 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Tenés {pendingUsers} usuario(s) esperando activación. Entrá a la
          pestaña “Usuarios” para activarlos.
        </p>
      )}
    </div>
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Panel de Control
      </h1>

      <AdminTabs
        tabs={[
          { id: "resumen", label: "Resumen", content: resumen },
          {
            id: "usuarios",
            label: "Usuarios",
            content: <AdminUsersSection adminId={admin.id} />,
          },
          {
            id: "empresa",
            label: "Empresa",
            content: <AdminCompanySection />,
          },
        ]}
      />
    </div>
  );
}

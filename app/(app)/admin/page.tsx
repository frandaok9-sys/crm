import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canAccessAdminPanel,
  canManageUsers,
  canManageCompany,
} from "@/lib/permissions";
import { UserStatus } from "@/lib/generated/prisma/enums";
import { AdminTabs } from "@/components/admin-tabs";
import { AdminUsersSection } from "@/components/admin-users-section";
import { AdminCompanySection } from "@/components/admin-company-section";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] border bg-card px-[18px] py-4">
      <div className="font-heading text-[24px] font-semibold tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export default async function AdminPage() {
  const admin = await requireActiveUser();
  if (!canAccessAdminPanel(admin)) redirect("/dashboard");

  const [activeUsers, pendingUsers, clients, opportunities, quotes] =
    await Promise.all([
      prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      prisma.user.count({ where: { status: UserStatus.PENDING } }),
      prisma.client.count(),
      prisma.opportunity.count(),
      prisma.quote.count(),
    ]);

  const resumen = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Usuarios activos" value={activeUsers} />
        <Stat label="Usuarios pendientes" value={pendingUsers} />
        <Stat label="Clientes" value={clients} />
        <Stat label="Oportunidades" value={opportunities} />
        <Stat label="Presupuestos" value={quotes} />
      </div>
      {pendingUsers > 0 && (
        <div className="flex items-center gap-3 rounded-[10px] border border-[#D9A03C]/35 bg-[#D9A03C]/10 px-4 py-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#D9A03C]" />
          <p className="text-[13px] text-text1">
            Tenés {pendingUsers} usuario(s) esperando activación. Entrá a la
            pestaña "Usuarios" para activarlos.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <h1 className="mb-6 text-[26px] font-semibold leading-tight">
        Panel de control
      </h1>

      <AdminTabs
        tabs={[
          { id: "resumen", label: "Resumen", content: resumen },
          ...(canManageUsers(admin)
            ? [
                {
                  id: "usuarios",
                  label: "Usuarios",
                  content: <AdminUsersSection adminId={admin.id} />,
                },
              ]
            : []),
          ...(canManageCompany(admin)
            ? [
                {
                  id: "empresa",
                  label: "Empresa",
                  content: <AdminCompanySection />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

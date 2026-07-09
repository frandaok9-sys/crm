import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { signOut } from "@/auth";
import { requireActiveUser } from "@/lib/auth";
import {
  ROLE_LABELS,
  canAccessAdminPanel,
  canManageLedger,
  clientScope,
  opportunityScope,
  quoteScope,
} from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company";
import { AppSidebar, type SidebarItem } from "@/components/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireActiveUser();
  const roleLabel = user.role ? ROLE_LABELS[user.role] : "Sin rol";
  const settings = await getCompanySettings();
  const cookieStore = await cookies();
  const theme =
    cookieStore.get("theme")?.value === "light" ? "light" : "dark";

  // Badges del nav (mismo alcance que cada módulo).
  const [clientCount, opportunityCount, quoteCount] = await Promise.all([
    prisma.client.count({ where: clientScope(user) }),
    prisma.opportunity.count({ where: opportunityScope(user) }),
    prisma.quote.count({ where: { ...quoteScope(user), version: 1 } }),
  ]);

  const items: SidebarItem[] = [
    { href: "/dashboard", label: "Inicio" },
    { href: "/clientes", label: "Clientes", badge: clientCount },
    { href: "/oportunidades", label: "Pipeline", badge: opportunityCount },
    { href: "/mapa", label: "Mapa" },
    { href: "/presupuestos", label: "Presupuestos", badge: quoteCount },
    { href: "/productos", label: "Productos" },
    ...(canManageLedger(user)
      ? [{ href: "/cobranzas", label: "Cobranzas" }]
      : []),
    { href: "/metricas", label: "Métricas" },
    ...(canAccessAdminPanel(user)
      ? [{ href: "/admin", label: "Panel de control" }]
      : []),
  ];

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        items={items}
        brandName={settings?.tradeName ?? "RC CRM"}
        brandTagline="Pisos Industriales"
        userName={user.name ?? user.email ?? "Usuario"}
        roleLabel={roleLabel}
        initialTheme={theme}
        signOutAction={signOutAction}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1240px] px-9 pb-10 pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}

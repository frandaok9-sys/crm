import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { signOut } from "@/auth";
import { requireActiveUser } from "@/lib/auth";
import {
  ROLE_LABELS,
  canAccessAdminPanel,
  canManageLedger,
  canLogExpenses,
  clientScope,
  opportunityScope,
  quoteScope,
} from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company";
import { EXECUTION_STAGE } from "@/lib/stages";
import { AppSidebar, type SidebarItem } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { AutoRefresh } from "@/components/auto-refresh";

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
    cookieStore.get("theme")?.value === "dark" ? "dark" : "light";

  // Badges del nav (mismo alcance que cada módulo).
  const [clientCount, opportunityCount, obraCount, quoteCount] =
    await Promise.all([
      prisma.client.count({ where: clientScope(user) }),
      prisma.opportunity.count({ where: opportunityScope(user) }),
      prisma.opportunity.count({
        where: { ...opportunityScope(user), stage: { name: EXECUTION_STAGE } },
      }),
      prisma.quote.count({ where: { ...quoteScope(user), version: 1 } }),
    ]);

  const items: SidebarItem[] = [
    { href: "/dashboard", label: "Inicio" },
    { href: "/clientes", label: "Clientes", badge: clientCount },
    { href: "/oportunidades", label: "Pipeline", badge: opportunityCount },
    { href: "/obras", label: "En obra", badge: obraCount },
    { href: "/mapa", label: "Mapa" },
    { href: "/presupuestos", label: "Presupuestos", badge: quoteCount },
    { href: "/productos", label: "Productos" },
    // Contabilidad agrupa Cobranzas + Gastos + Finanzas (sub-pestañas adentro).
    ...(canManageLedger(user) || canLogExpenses(user)
      ? [{ href: "/contabilidad", label: "Contabilidad" }]
      : []),
    { href: "/metricas", label: "Métricas" },
    { href: "/asistente", label: "Asistente IA" },
    ...(canAccessAdminPanel(user)
      ? [{ href: "/admin", label: "Panel de control" }]
      : []),
  ];

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    // 100dvh: en el celu, 100vh incluye la barra del navegador y deja la
    // barra inferior tapada; dvh mide lo realmente visible (en escritorio
    // es lo mismo que h-screen).
    <div
      className="flex h-screen overflow-hidden bg-background"
      style={{ height: "100dvh" }}
    >
      <AppSidebar
        items={items}
        brandName={settings?.tradeName ?? "RC CRM"}
        brandTagline="Pisos Industriales"
        userName={user.name ?? user.email ?? "Usuario"}
        roleLabel={roleLabel}
        initialTheme={theme}
        signOutAction={signOutAction}
      />
      {/* Móvil: menos margen y aire abajo para la barra de navegación */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-5 lg:px-9 lg:pb-10 lg:pt-8">
          {children}
        </div>
      </main>
      {/* Búsqueda global: Ctrl+K / Cmd+K desde cualquier pantalla. */}
      <CommandPalette />
      {/* Notificaciones y tareas al día: refresco de datos cada 60 s
          sin recargar la página (se pausa si estás escribiendo). */}
      <AutoRefresh seconds={60} />
    </div>
  );
}

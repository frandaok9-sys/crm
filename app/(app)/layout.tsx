import { cookies } from "next/headers";

import { signOut } from "@/auth";
import { requireActiveUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company";
import { getNavItems, defaultDockHrefs } from "@/lib/nav";
import { DockEditor } from "@/components/dock-editor";
import { AppShell } from "@/components/app-shell";
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

  // Apps visibles para este usuario (misma capa de permisos que cada módulo),
  // con sus contadores. Alimenta el armazón y el buscador.
  const items = await getNavItems(user);

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShell
      items={items}
      brandName={settings?.tradeName ?? "RC CRM"}
      brandTagline="Pisos Industriales"
      userName={user.name ?? user.email ?? "Usuario"}
      roleLabel={roleLabel}
      initialTheme={theme}
      signOutAction={signOutAction}
    >
      {children}
      {/* Búsqueda global: Ctrl+K / Cmd+K desde cualquier pantalla (apps +
          clientes, oportunidades y presupuestos). */}
      <CommandPalette
        apps={items.map((i) => ({
          href: i.href,
          label: i.label,
          hint: i.hint,
          sub: i.sub,
        }))}
      />
      {/* Editor de la barra de accesos rápidos (se abre desde el dock o el
          lanzador); guarda en el usuario y refresca el armazón. */}
      <DockEditor items={items} defaultHrefs={defaultDockHrefs(items)} />
      {/* Notificaciones y tareas al día: refresco de datos cada 60 s
          sin recargar la página (se pausa si estás escribiendo). */}
      <AutoRefresh seconds={60} />
    </AppShell>
  );
}

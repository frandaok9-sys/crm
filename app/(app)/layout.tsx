import Link from "next/link";

import { requireActiveUser } from "@/lib/auth";
import { ROLE_LABELS, canManageUsers } from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireActiveUser();
  const roleLabel = user.role ? ROLE_LABELS[user.role] : "Sin rol";
  const showAdmin = canManageUsers(user);
  const settings = await getCompanySettings();
  const brandName = settings?.tradeName ?? settings?.legalName ?? "CRM";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b bg-white dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <nav className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center">
              {settings?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logo}
                  alt={brandName}
                  className="h-8 w-auto"
                />
              ) : (
                <span className="text-lg font-semibold tracking-tight">
                  {brandName}
                </span>
              )}
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Inicio
            </Link>
            <Link
              href="/clientes"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Clientes
            </Link>
            <Link
              href="/oportunidades"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Pipeline
            </Link>
            <Link
              href="/presupuestos"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Presupuestos
            </Link>
            {showAdmin && (
              <Link
                href="/admin"
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Panel de Control
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <div className="font-medium">{user.name ?? user.email}</div>
              <div className="text-xs text-zinc-500">{roleLabel}</div>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

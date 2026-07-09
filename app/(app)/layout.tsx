import Link from "next/link";

import { requireActiveUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireActiveUser();
  const roleLabel = user.role ? ROLE_LABELS[user.role] : "Sin rol";
  const settings = await getCompanySettings();
  const brandName = settings?.tradeName ?? settings?.legalName ?? "RC CRM";

  return (
    <div className="min-h-screen bg-background">
      {/* Steel-dark header with brand-red baseline */}
      <header className="border-b-2 border-primary bg-zinc-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center">
              {settings?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logo}
                  alt={brandName}
                  className="h-9 w-auto"
                />
              ) : (
                <span className="font-heading text-xl font-semibold uppercase tracking-wide text-white">
                  <span className="text-primary">RC</span> CRM
                </span>
              )}
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
            >
              <span aria-hidden>←</span> Inicio
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <div className="font-medium text-zinc-100">
                {user.name ?? user.email}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                {roleLabel}
              </div>
            </div>
            <SignOutButton appearance="dark" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

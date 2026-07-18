"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ContabilidadTab = { href: string; label: string };

/** Sub-pestañas de Contabilidad (Cobranzas / Gastos / Finanzas). */
export function ContabilidadTabs({ tabs }: { tabs: ContabilidadTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1.5">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-hoverbg"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

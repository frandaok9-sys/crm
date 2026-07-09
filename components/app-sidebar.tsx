"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/components/initials-avatar";

export type SidebarItem = {
  href: string;
  label: string;
  badge?: number;
};

/**
 * Sidebar fija auto-plegable (handoff hifi): 68px colapsada → 236px al hover.
 * La versión expandida se superpone al contenido (absolute dentro de un
 * wrapper de 68px) para no reacomodar la página.
 */
export function AppSidebar({
  items,
  brandName,
  brandTagline,
  userName,
  roleLabel,
  initialTheme,
  signOutAction,
}: {
  items: SidebarItem[];
  brandName: string;
  brandTagline: string;
  userName: string;
  roleLabel: string;
  initialTheme: "dark" | "light";
  signOutAction: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(initialTheme);
  const pathname = usePathname();

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="relative w-[68px] shrink-0">
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className="absolute inset-y-0 left-0 z-[1100] flex flex-col overflow-hidden border-r border-border bg-side"
        style={{
          width: expanded ? 236 : 68,
          transition: "width 0.22s ease",
          boxShadow: expanded ? "var(--shadow-panel)" : "none",
        }}
      >
        {/* Logo */}
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-3 px-[17px] py-4",
            !expanded && "justify-center px-0"
          )}
        >
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] bg-primary font-heading text-[15px] font-semibold text-white">
            RC
          </span>
          {expanded && (
            <span className="min-w-0">
              <span className="block truncate font-heading text-[15px] font-semibold uppercase leading-tight text-foreground">
                {brandName}
              </span>
              <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {brandTagline}
              </span>
            </span>
          )}
        </Link>

        <div className="mx-3 border-t border-border" />

        {/* Navegación */}
        <nav className="mt-2 flex-1 space-y-0.5 px-2.5">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex items-center rounded-[8px] px-3 py-[9px] transition-colors",
                  expanded ? "gap-3" : "justify-center px-0",
                  active ? "bg-navactive" : "hover:bg-hoverbg"
                )}
              >
                <span
                  className={cn(
                    "h-[6px] w-[6px] shrink-0 rounded-[2px]",
                    active ? "bg-primary" : "bg-avbd"
                  )}
                />
                {expanded && (
                  <>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[13.5px]",
                        active
                          ? "font-bold text-foreground"
                          : "font-medium text-muted-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                    {item.badge != null && item.badge > 0 && (
                      <span className="rounded-[10px] bg-chip px-1.5 py-px text-[11px] tabular-nums text-muted2">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Toggle de tema */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          className={cn(
            "mx-2.5 mb-2 flex items-center rounded-[8px] px-3 py-[9px] transition-colors hover:bg-hoverbg",
            expanded ? "gap-3" : "justify-center px-0"
          )}
        >
          {expanded ? (
            <>
              <span
                className={cn(
                  "relative h-[21px] w-[38px] shrink-0 rounded-[11px] border transition-colors duration-200",
                  theme === "dark"
                    ? "border-avbd bg-chip"
                    : "border-primary bg-primary"
                )}
              >
                {/* Glifo */}
                <span
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 text-[10px] leading-none",
                    theme === "dark"
                      ? "right-[5px] text-muted-foreground"
                      : "left-[5px] text-white"
                  )}
                >
                  {theme === "dark" ? "☾" : "☀"}
                </span>
                {/* Perilla */}
                <span
                  className="absolute top-[2.5px] h-[15px] w-[15px] rounded-full bg-white transition-all duration-200"
                  style={{ left: theme === "dark" ? 3 : 19 }}
                />
              </span>
              <span className="text-[12.5px] font-medium text-muted-foreground">
                {theme === "dark" ? "Modo oscuro" : "Modo claro"}
              </span>
            </>
          ) : (
            <span className="text-[13px] text-muted-foreground">
              {theme === "dark" ? "☾" : "☀"}
            </span>
          )}
        </button>

        {/* Footer usuario */}
        <div
          className={cn(
            "flex items-center gap-2.5 border-t border-border px-[17px] py-3",
            !expanded && "justify-center px-0"
          )}
        >
          <InitialsAvatar name={userName} size={32} />
          {expanded && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-foreground">
                  {userName}
                </span>
                <span className="block truncate text-[10.5px] uppercase tracking-wide text-muted-foreground">
                  {roleLabel}
                </span>
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-[11px] text-muted-foreground transition-colors hover:text-text1"
                >
                  Salir
                </button>
              </form>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

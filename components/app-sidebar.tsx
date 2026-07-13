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

/* Line-icons industriales (paths 24×24 del handoff), por ruta. */
const ICON_PATHS: Record<string, string> = {
  "/dashboard": "M4 11l8-7 8 7M6 10v10h12V10",
  "/clientes":
    "M9 10a3 3 0 100-6 3 3 0 000 6M3.5 20a5.5 5.5 0 0111 0M16 4.5a3 3 0 010 6M18 14.5a5.5 5.5 0 013 4.5",
  "/oportunidades": "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 100 8 4 4 0 000-8z",
  "/mapa": "M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11zM12 10a2 2 0 100-4 2 2 0 000 4",
  "/presupuestos": "M7 3h8l4 4v14H7zM15 3v4h4M10 13h6M10 17h6",
  "/productos": "M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10",
  "/cobranzas": "M3 6h18v12H3zM3 10h18M6 14h5",
  "/metricas": "M4 20h16M6 20v-6M11 20V8M16 20v-9",
  "/asistente":
    "M12 3l1.6 4.2L18 9l-4.4 1.8L12 15l-1.6-4.2L6 9l4.4-1.8zM18.5 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  "/admin": "M4 8h16M4 16h16M9 6v4M15 14v4",
};

function ThemeIcon({ dark, stroke = "var(--muted)" }: { dark: boolean; stroke?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {dark ? (
        <path d="M12 8a4 4 0 100 8 4 4 0 000-8zM12 3v2M12 19v2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M3 12h2M19 12h2M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4" />
      ) : (
        <path d="M20 14.5A8 8 0 019.5 4 7.5 7.5 0 1020 14.5z" />
      )}
    </svg>
  );
}

function NavIcon({ d, active }: { d: string; active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] transition-colors",
        active ? "bg-primary" : "border border-border2 bg-avbg"
      )}
      style={active ? { boxShadow: "0 3px 8px rgba(224,80,58,0.32)" } : undefined}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "#FFFFFF" : "var(--text2)"}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={d} />
      </svg>
    </span>
  );
}

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
          <svg
            width="34"
            height="34"
            viewBox="0 0 100 100"
            className="shrink-0"
            style={{ color: "var(--foreground)" }}
          >
            <path
              d="M57 29 A27 27 0 1 0 57 71"
              fill="none"
              stroke="#E0503A"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <text
              x="49"
              y="75"
              fontSize="72"
              fontWeight="800"
              letterSpacing="-3"
              fill="currentColor"
            >
              R
            </text>
          </svg>
          {expanded && (
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-tight tracking-[-0.02em] text-foreground">
                {brandName}
              </span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
                  "flex items-center rounded-[10px] py-[7px] transition-colors",
                  expanded ? "gap-3 px-2.5" : "justify-center px-0",
                  active ? "bg-navactive" : "hover:bg-hoverbg"
                )}
              >
                <NavIcon d={ICON_PATHS[item.href] ?? ICON_PATHS["/dashboard"]} active={active} />
                {expanded && (
                  <>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[14px]",
                        active
                          ? "font-semibold text-foreground"
                          : "font-medium text-muted-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                    {item.badge != null && item.badge > 0 && (
                      <span className="flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold tabular-nums text-white">
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
                    "absolute top-1/2 -translate-y-1/2",
                    theme === "dark" ? "right-[4px]" : "left-[4px]"
                  )}
                >
                  <ThemeIcon dark={theme === "dark"} stroke={theme === "dark" ? "var(--muted)" : "#fff"} />
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
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-border2 bg-avbg">
              <ThemeIcon dark={theme === "dark"} stroke="var(--text2)" />
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

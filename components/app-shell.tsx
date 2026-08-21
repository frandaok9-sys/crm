"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/components/initials-avatar";
import { AppTile } from "@/components/app-tile";
import { pushRecent } from "@/components/recent-apps";
import {
  APP_GROUP_LABELS,
  APP_GROUP_ORDER,
  ICON_PATHS,
  appMatches,
  isItemActive,
  type NavItem,
} from "@/lib/nav-registry";

function Icon({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

function ThemeIcon({ dark }: { dark: boolean }) {
  return (
    <Icon
      size={16}
      d={
        dark
          ? "M12 8a4 4 0 100 8 4 4 0 000-8zM12 3v2M12 19v2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M3 12h2M19 12h2M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4"
          : "M20 14.5A8 8 0 019.5 4 7.5 7.5 0 1020 14.5z"
      }
    />
  );
}

const LAUNCHPAD_EVENT = "rc:abrir-lanzador";
import { DOCK_EDITOR_EVENT } from "@/components/dock-editor";

/**
 * Armazón "tipo software": barra superior (logo → escritorio de apps,
 * buscador, tema, usuario), miga de pan con Atrás, dock inferior en
 * escritorio, barra inferior en el celular y lanzador de apps superpuesto.
 * Las pantallas de cada módulo (children) no cambian.
 */
export function AppShell({
  items,
  brandName,
  brandTagline,
  userName,
  roleLabel,
  initialTheme,
  signOutAction,
  children,
}: {
  items: NavItem[];
  brandName: string;
  brandTagline: string;
  userName: string;
  roleLabel: string;
  initialTheme: "dark" | "light";
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"dark" | "light">(initialTheme);
  const [userOpen, setUserOpen] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  const [padQuery, setPadQuery] = useState("");
  const padInput = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const current = items.find((i) => isItemActive(pathname, i.href)) ?? null;
  const onLauncher = pathname === "/apps";
  const pinned = items
    .filter((i) => i.pinned)
    .sort((a, b) => (a.dockOrder ?? 99) - (b.dockOrder ?? 99));
  const openDockEditor = () => {
    setPadOpen(false);
    window.dispatchEvent(new Event(DOCK_EDITOR_EVENT));
  };

  // Al navegar: cerrar lo abierto y anotar la app como reciente.
  useEffect(() => {
    setPadOpen(false);
    setUserOpen(false);
    if (current && current.href !== "/apps") pushRecent(current.href);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lanzador: evento global (barra móvil, otros botones) y teclado.
  useEffect(() => {
    const open = () => setPadOpen(true);
    window.addEventListener(LAUNCHPAD_EVENT, open);
    return () => window.removeEventListener(LAUNCHPAD_EVENT, open);
  }, []);
  useEffect(() => {
    if (!padOpen) return;
    setPadQuery("");
    setTimeout(() => padInput.current?.focus(), 30);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPadOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [padOpen]);

  // Menú de usuario: clic afuera / Escape.
  useEffect(() => {
    if (!userOpen) return;
    function onDown(e: MouseEvent) {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setUserOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [userOpen]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  const padMatches = items.filter((i) => appMatches(i, padQuery));

  return (
    // 100dvh: en el celu, 100vh incluye la barra del navegador.
    <div
      className="flex h-screen flex-col overflow-hidden bg-background"
      style={{ height: "100dvh" }}
    >
      {/* ---------- Barra superior ---------- */}
      <header className="z-[1000] flex h-[58px] shrink-0 items-center gap-2.5 border-b border-border bg-side px-3 backdrop-blur-xl lg:gap-3 lg:px-5">
        <Link
          href="/apps"
          title="Escritorio de aplicaciones"
          className="flex shrink-0 items-center gap-2.5"
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
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-[14px] font-bold leading-tight tracking-[-0.02em] text-foreground">
              {brandName}
            </span>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {brandTagline}
            </span>
          </span>
        </Link>

        {/* Buscador: ir a una app o buscar un registro (Ctrl K) */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("rc:abrir-buscador"))}
          title="Ir a una app o buscar cliente, oportunidad o presupuesto (Ctrl K)"
          className="ml-auto flex h-9 w-9 items-center justify-center gap-2 rounded-[10px] border border-border bg-card text-[13px] text-muted-foreground transition-colors hover:bg-hoverbg sm:w-auto sm:min-w-[260px] sm:max-w-[440px] sm:flex-1 sm:justify-start sm:px-3"
        >
          <Icon size={16} d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3" />
          <span className="hidden truncate sm:block">
            Ir a una app o buscar… (clientes, presupuestos, gastos)
          </span>
          <kbd className="ml-auto hidden rounded border border-border2 px-1.5 py-0.5 font-mono text-[10px] sm:block">
            Ctrl K
          </kbd>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-card text-text2 transition-colors hover:bg-hoverbg"
        >
          <ThemeIcon dark={theme === "dark"} />
        </button>

        {/* Usuario: Mi cuenta / cerrar sesión */}
        <div ref={userMenuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2 rounded-[10px] py-1 pl-1 pr-1 transition-colors hover:bg-hoverbg sm:pr-2"
            title="Mi cuenta"
          >
            <InitialsAvatar name={userName} size={32} />
            <span className="hidden min-w-0 text-left lg:block">
              <span className="block max-w-[160px] truncate text-[13px] font-semibold text-foreground">
                {userName}
              </span>
              <span className="block text-[10.5px] uppercase tracking-wide text-muted-foreground">
                {roleLabel}
              </span>
            </span>
          </button>
          {userOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-[1300] w-60 overflow-hidden rounded-[14px] border border-border bg-card shadow-2xl">
              <div className="border-b border-border2 px-4 py-3">
                <span className="block truncate text-[13px] font-semibold">{userName}</span>
                <span className="block text-[10.5px] uppercase tracking-wide text-muted-foreground">
                  {roleLabel}
                </span>
              </div>
              <Link
                href="/cuenta"
                className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-hoverbg"
              >
                <Icon size={16} d={ICON_PATHS["/cuenta"]} />
                Mi cuenta
              </Link>
              <Link
                href="/apps"
                className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-hoverbg"
              >
                <Icon size={16} d={ICON_PATHS["/apps"]} />
                Escritorio de aplicaciones
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-muted-foreground hover:bg-hoverbg hover:text-foreground"
                >
                  <Icon size={16} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                  Cerrar sesión
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      {/* ---------- Miga de pan con Atrás (en los módulos) ---------- */}
      {!onLauncher && (
        <div className="flex h-[38px] shrink-0 items-center gap-3 border-b border-border2 bg-card2/60 px-3 text-[12px] text-muted-foreground lg:px-5">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-7 items-center gap-1 rounded-[8px] border border-border bg-card px-2 text-[12px] font-semibold text-text2 transition-colors hover:bg-hoverbg"
            title="Volver a la pantalla anterior"
          >
            <Icon size={14} d="M15 18l-6-6 6-6" />
            Atrás
          </button>
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <Link href="/apps" className="hover:text-foreground hover:underline">
              Aplicaciones
            </Link>
            {current && (
              <>
                <span>›</span>
                <Link href="/apps" className="hover:text-foreground hover:underline">
                  {APP_GROUP_LABELS[current.group]}
                </Link>
                <span>›</span>
                <span className="truncate font-semibold text-text2">{current.label}</span>
              </>
            )}
          </span>
        </div>
      )}

      {/* ---------- Contenido del módulo (sin cambios) ---------- */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-5 lg:px-9 lg:pb-28 lg:pt-7">
          {children}
        </div>
      </main>

      {/* ---------- Dock (escritorio) ---------- */}
      <nav
        aria-label="Dock de aplicaciones"
        className="fixed bottom-4 left-1/2 z-[1100] hidden -translate-x-1/2 items-center gap-1 rounded-[18px] border border-border bg-side p-2 shadow-[var(--shadow-panel)] backdrop-blur-xl lg:flex"
      >
        <button
          type="button"
          onClick={() => setPadOpen(true)}
          title="Todas las aplicaciones (Ctrl K para buscar)"
          className="flex h-12 w-12 items-center justify-center rounded-[13px] border border-border bg-card text-text2 transition-colors hover:bg-hoverbg"
        >
          <Icon size={20} d={ICON_PATHS["/apps"]} />
        </button>
        <span className="mx-1 h-7 w-px bg-border" />
        {pinned.map((item) => {
          const active = isItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "relative flex h-12 w-12 items-center justify-center rounded-[13px] transition-colors hover:bg-hoverbg",
                active && "bg-navactive"
              )}
            >
              <span
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-white"
                style={{ background: item.color }}
              >
                <Icon size={16} d={ICON_PATHS[item.href] ?? ICON_PATHS["/dashboard"]} />
              </span>
              {item.badge != null && item.badge > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-white">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
              {active && (
                <span className="absolute bottom-[3px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
        <span className="mx-1 h-7 w-px bg-border" />
        <button
          type="button"
          onClick={openDockEditor}
          title="Editar accesos rápidos (agregar, quitar, ordenar)"
          className="flex h-12 w-9 items-center justify-center rounded-[13px] text-muted-foreground transition-colors hover:bg-hoverbg hover:text-foreground"
        >
          <Icon size={16} d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
        </button>
      </nav>

      {/* ---------- Barra inferior (celular) ---------- */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-[1100] flex items-stretch justify-around border-t border-border bg-side pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        {pinned.slice(0, 4).map((item) => {
          const active = isItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pb-2 pt-2.5",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon size={22} d={ICON_PATHS[item.href] ?? ICON_PATHS["/dashboard"]} />
              <span className="max-w-full truncate text-[10px] font-medium">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="absolute right-1/2 top-1 -mr-[22px] flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold tabular-nums text-white">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setPadOpen(true)}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pb-2 pt-2.5",
            padOpen ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Icon size={22} d={ICON_PATHS["/apps"]} />
          <span className="text-[10px] font-medium">Apps</span>
        </button>
      </nav>

      {/* ---------- Lanzador de aplicaciones (superpuesto) ---------- */}
      {padOpen && (
        <div
          className="fixed inset-0 z-[1150] flex items-start justify-center bg-black/35 p-2 pt-3 backdrop-blur-sm lg:p-4 lg:pt-[8vh]"
          onMouseDown={() => setPadOpen(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-[860px] flex-col overflow-hidden rounded-[20px] border border-border bg-background shadow-2xl lg:max-h-[84vh]"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Aplicaciones"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Icon size={18} d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3" className="text-muted-foreground" />
              <input
                ref={padInput}
                value={padQuery}
                onChange={(e) => setPadQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && padMatches[0]) {
                    e.preventDefault();
                    setPadOpen(false);
                    router.push(padMatches[0].href);
                  }
                }}
                placeholder="Escribí para buscar una app… (Enter abre, Esc cierra)"
                className="h-9 w-full bg-transparent text-[14px] outline-none placeholder:text-muted2"
              />
              <button
                type="button"
                onClick={openDockEditor}
                title="Editar accesos rápidos"
                className="shrink-0 rounded-[8px] border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-hoverbg hover:text-foreground"
              >
                Editar accesos
              </button>
              <button
                type="button"
                onClick={() => setPadOpen(false)}
                className="shrink-0 rounded border border-border2 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                ESC
              </button>
            </div>
            <div className="overflow-y-auto p-3 lg:p-4">
              {padMatches.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Ninguna app coincide con “{padQuery.trim()}”.
                </p>
              ) : (
                APP_GROUP_ORDER.map((group) => {
                  const apps = padMatches.filter((i) => i.group === group);
                  if (apps.length === 0) return null;
                  return (
                    <section key={group} className="mb-4 last:mb-0">
                      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {APP_GROUP_LABELS[group]}
                      </h2>
                      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(130px,1fr))]">
                        {apps.map((item) => (
                          <AppTile
                            key={item.href}
                            item={item}
                            compact
                            onNavigate={() => setPadOpen(false)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

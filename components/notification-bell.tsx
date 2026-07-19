"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { fetchNotifications } from "@/app/(app)/notifications-action";
import type { AppNotification } from "@/lib/alerts";

const TONE_COLOR: Record<AppNotification["tone"], string> = {
  red: "#C43C2B",
  amber: "#D9A03C",
  blue: "#5B82D6",
};

/**
 * Centro de notificaciones del sidebar. Al tocar la campana se abre un panel
 * con las novedades reales (tareas vencidas, presupuestos sin respuesta, obras
 * sin avanzar, clientes por completar); cada una lleva directo al registro.
 * El panel se renderiza por PORTAL en el body: el sidebar tiene overflow-hidden
 * y lo recortaría.
 */
export function NotificationBell({
  count,
  expanded,
}: {
  count: number;
  expanded: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ left: 74, bottom: 96 });

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        left: rect.right + 12,
        bottom: Math.max(12, window.innerHeight - rect.bottom),
      });
    }
    setOpen(true);
    setLoading(true);
    try {
      setItems(await fetchNotifications());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // Cerrar al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={count > 0 ? `${count} cosa(s) requieren atención` : "Sin novedades"}
        className={cn(
          "mx-2.5 flex items-center rounded-[10px] py-[7px] transition-colors hover:bg-hoverbg",
          expanded ? "gap-3 px-2.5" : "justify-center px-0",
          open && "bg-hoverbg"
        )}
      >
        <span className="relative flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border border-border2 bg-chip">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted)"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4a5 5 0 015 5v3l2 3H5l2-3V9a5 5 0 015-5zM10 20a2 2 0 004 0" />
          </svg>
          {count > 0 && (
            <span
              className="absolute -right-[5px] -top-[5px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-white"
              style={{ border: "2px solid var(--side)" }}
            >
              {count > 9 ? "9+" : count}
            </span>
          )}
        </span>
        {expanded && (
          <span className="min-w-0 flex-1 truncate text-left text-[14px] font-medium text-muted-foreground">
            Notificaciones
          </span>
        )}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[1200] w-[320px] overflow-hidden rounded-[14px] border bg-card shadow-2xl"
            style={{ left: pos.left, bottom: pos.bottom }}
          >
            <div className="flex items-center justify-between border-b border-border2 px-4 py-3">
              <span className="text-[13px] font-semibold">Notificaciones</span>
              {count > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {count}
                </span>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {loading ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Cargando…
                </p>
              ) : !items || items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Todo al día. Sin novedades. ✨
                </p>
              ) : (
                <ul>
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => go(n.href)}
                        className="flex w-full items-start gap-3 border-b border-border2 px-4 py-3 text-left last:border-0 hover:bg-hoverbg"
                      >
                        <span
                          className="mt-[3px] h-2 w-2 shrink-0 rounded-full"
                          style={{ background: TONE_COLOR[n.tone] }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {n.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {n.subtitle}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={() => go("/dashboard")}
              className="block w-full border-t border-border2 px-4 py-2.5 text-center text-xs font-semibold text-primary hover:bg-hoverbg"
            >
              Ver todo en el Inicio →
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

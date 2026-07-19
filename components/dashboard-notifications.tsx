"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/alerts";

const TONE_COLOR: Record<AppNotification["tone"], string> = {
  red: "#C43C2B",
  amber: "#D9A03C",
  blue: "#5B82D6",
};

const DISMISSED_KEY = "rc-dismissed-notifs";

/**
 * Campanita de novedades en el Inicio: un ícono con el número de novedades
 * activas. Al hacer clic se despliega un panel HACIA EL COSTADO con la lista;
 * cada novedad tiene una ✕ para descartarla (se recuerda en el navegador, así
 * no vuelve a molestar). Si el problema de fondo se resuelve, la novedad
 * desaparece sola.
 */
export function DashboardNotifications({ items }: { items: AppNotification[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  // Cargar las descartadas guardadas (solo en el navegador).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* localStorage no disponible */
    }
  }, []);

  // Cerrar al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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

  function dismiss(id: string) {
    setDismissed((prev) => {
      const nextSet = new Set(prev);
      nextSet.add(id);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...nextSet]));
      } catch {
        /* localStorage no disponible */
      }
      return nextSet;
    });
  }

  const visible = items.filter((n) => !dismissed.has(n.id));
  const count = visible.length;

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={count > 0 ? `${count} novedad(es)` : "Sin novedades"}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
          count > 0
            ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
            : "border-border2 bg-card2 text-muted-foreground hover:bg-hoverbg",
          open && "ring-2 ring-primary/30"
        )}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4a5 5 0 015 5v3l2 3H5l2-3V9a5 5 0 015-5zM10 20a2 2 0 004 0" />
        </svg>
        {count > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-white"
            style={{ border: "2px solid var(--background)" }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* Panel: se despliega HACIA EL COSTADO (derecha), no empuja el layout. */}
      <div
        className={cn(
          "absolute left-[calc(100%+10px)] top-0 z-30 w-[340px] max-w-[70vw] origin-left overflow-hidden rounded-[14px] border bg-card shadow-2xl transition-all duration-200",
          open
            ? "visible translate-x-0 opacity-100"
            : "pointer-events-none invisible -translate-x-2 opacity-0"
        )}
      >
        <div className="flex items-center justify-between border-b border-border2 px-4 py-2.5">
          <span className="text-[13px] font-semibold">Novedades</span>
          {count > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {count}
            </span>
          )}
        </div>

        {count === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Todo al día. Sin novedades. ✨
          </p>
        ) : (
          <ul className="max-h-[52vh] overflow-y-auto">
            {visible.map((n) => (
              <li key={n.id} className="flex items-start border-b border-border2 last:border-0">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(n.href);
                  }}
                  className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 text-left hover:bg-hoverbg"
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
                <button
                  type="button"
                  onClick={() => dismiss(n.id)}
                  title="Descartar"
                  className="shrink-0 px-3 py-3 text-muted-foreground hover:text-red-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

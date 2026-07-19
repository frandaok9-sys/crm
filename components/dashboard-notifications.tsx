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

const AUTO_COLLAPSE_MS = 6000;

/**
 * Novedades al lado del "Hola, {usuario}" en el Inicio: arranca DESPLEGADA al
 * abrir la pantalla y se pliega sola a los pocos segundos (o al hacer clic).
 * Se vuelve a abrir con un clic en el chip. Si no hay novedades, muestra un
 * chip discreto "Sin novedades".
 */
export function DashboardNotifications({ items }: { items: AppNotification[] }) {
  const router = useRouter();
  const hasItems = items.length > 0;
  const [open, setOpen] = useState(hasItems); // desplegada al abrir el Inicio
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Auto-plegado tras unos segundos (se cancela si el usuario interactúa).
  useEffect(() => {
    if (open && hasItems) {
      timerRef.current = setTimeout(() => setOpen(false), AUTO_COLLAPSE_MS);
      return clearTimer;
    }
  }, [open, hasItems]);

  if (!hasItems) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border2 bg-card2 px-3 py-1 text-xs font-medium text-muted-foreground">
        <span aria-hidden>✅</span> Sin novedades
      </span>
    );
  }

  return (
    <div className="relative" onMouseEnter={clearTimer}>
      <button
        type="button"
        onClick={() => {
          clearTimer();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/15"
        title={open ? "Ocultar novedades" : "Ver novedades"}
      >
        <span className="relative flex items-center">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4a5 5 0 015 5v3l2 3H5l2-3V9a5 5 0 015-5zM10 20a2 2 0 004 0" />
          </svg>
        </span>
        {items.length} novedad{items.length === 1 ? "" : "es"}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("transition-transform", open && "rotate-180")}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Panel: desplegable animado, no empuja el layout (absolute). */}
      <div
        className={cn(
          "absolute left-0 top-[calc(100%+8px)] z-30 w-[340px] max-w-[86vw] origin-top overflow-hidden rounded-[14px] border bg-card shadow-2xl transition-all duration-200",
          open
            ? "visible translate-y-0 opacity-100"
            : "pointer-events-none invisible -translate-y-1 opacity-0"
        )}
      >
        <div className="border-b border-border2 px-4 py-2.5 text-[13px] font-semibold">
          Novedades
        </div>
        <ul className="max-h-[52vh] overflow-y-auto">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(n.href);
                }}
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
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { AppNotification } from "@/lib/alerts";

// Misma clave que la campanita del Inicio: lo que descartás en un lado no
// vuelve a aparecer en el otro.
const DISMISSED_KEY = "rc-dismissed-notifs";

const TONE_META: Record<
  AppNotification["tone"],
  { label: string; dot: string; chip: string }
> = {
  red: { label: "Urgente", dot: "#C43C2B", chip: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  amber: { label: "Atención", dot: "#D9A03C", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  blue: { label: "Novedad", dot: "#5B82D6", chip: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
};

const TONE_ORDER: AppNotification["tone"][] = ["red", "amber", "blue"];
const INITIAL_VISIBLE = 6;
const OPEN_KEY = "rc-novedades-abierto";

/**
 * Panel de novedades con detalle (escritorio de apps): cada novedad con su
 * nivel (urgente / atención / novedad), título, detalle y acceso directo a
 * donde se resuelve. Se pueden descartar (se recuerda en este navegador).
 */
export function NotificationsPanel({ items }: { items: AppNotification[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  // Desplegable: cerrado por defecto; recuerda cómo lo dejaste.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]));
      if (localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      /* localStorage no disponible */
    }
  }, []);

  function toggleOpen() {
    setOpen((v) => {
      try {
        localStorage.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        /* localStorage no disponible */
      }
      return !v;
    });
  }

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      } catch {
        /* localStorage no disponible */
      }
      return next;
    });
  }

  const visible = items
    .filter((n) => !dismissed.has(n.id))
    .sort((a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone));
  const shown = showAll ? visible : visible.slice(0, INITIAL_VISIBLE);
  const urgent = visible.filter((n) => n.tone === "red").length;

  return (
    <section className="relative rounded-[16px] border border-border bg-card shadow-[var(--shadow-sm)]">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-[16px] px-4 py-3 text-left transition-colors hover:bg-hoverbg"
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
          className={visible.length > 0 ? "text-primary" : "text-muted-foreground"}
        >
          <path d="M12 4a5 5 0 015 5v3l2 3H5l2-3V9a5 5 0 015-5zM10 20a2 2 0 004 0" />
        </svg>
        <h2 className="text-[13px] font-semibold">Novedades</h2>
        {visible.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {visible.length}
          </span>
        )}
        {urgent > 0 && (
          <span className="ml-auto text-[11px] font-semibold text-red-600 dark:text-red-400">
            {urgent} urgente{urgent === 1 ? "" : "s"}
          </span>
        )}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-muted-foreground transition-transform ${urgent > 0 ? "" : "ml-auto"} ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="max-h-[70vh] overflow-y-auto border-t border-border2 lg:absolute lg:right-0 lg:top-full lg:z-30 lg:mt-2 lg:w-[380px] lg:rounded-[16px] lg:border lg:border-border lg:bg-card lg:shadow-2xl">

      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Todo al día. Sin novedades. ✨
        </p>
      ) : (
        <ul className="divide-y divide-border2">
          {shown.map((n) => {
            const meta = TONE_META[n.tone];
            return (
              <li key={n.id} className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-hoverbg">
                <span
                  aria-hidden
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: meta.dot }}
                />
                <Link href={n.href} className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${meta.chip}`}>
                      {meta.label}
                    </span>
                  </span>
                  <span className="mt-1 block text-[13px] font-semibold leading-snug text-foreground">
                    {n.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    {n.subtitle}
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-primary">
                    Ir a resolverla →
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => dismiss(n.id)}
                  title="Descartar (no volver a mostrar)"
                  className="shrink-0 rounded p-1 text-muted2 opacity-60 transition-opacity hover:text-foreground group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {visible.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="block w-full border-t border-border2 px-4 py-2.5 text-center text-[12px] font-medium text-primary hover:bg-hoverbg"
        >
          {showAll ? "Ver menos" : `Ver las ${visible.length} novedades`}
        </button>
      )}
        </div>
      )}
    </section>
  );
}

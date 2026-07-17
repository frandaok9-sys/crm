"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  globalSearchAction,
  type GlobalSearchHit,
} from "@/app/(app)/global-search-action";

const KIND_LABELS: Record<GlobalSearchHit["kind"], string> = {
  client: "Cliente",
  opportunity: "Oportunidad",
  quote: "Presupuesto",
};

const KIND_ICONS: Record<GlobalSearchHit["kind"], string> = {
  client: "🏢",
  opportunity: "📌",
  quote: "🧾",
};

/**
 * Búsqueda global (Ctrl+K / Cmd+K): clientes, oportunidades y presupuestos
 * desde cualquier pantalla. Flechas para moverse, Enter para abrir, Esc cierra.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);

  // Atajo global.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Al abrir: foco y limpieza.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Búsqueda con debounce; descarta respuestas viejas.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await globalSearchAction(q);
        if (requestSeq.current === seq) {
          setHits(rows);
          setActive(0);
        }
      } catch {
        if (requestSeq.current === seq) setHits([]);
      } finally {
        if (requestSeq.current === seq) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query, open]);

  const go = useCallback(
    (hit: GlobalSearchHit) => {
      setOpen(false);
      router.push(hit.href);
    },
    [router]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[14vh] backdrop-blur-[2px]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[14px] border bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border2 px-4">
          <span aria-hidden>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && hits[active]) {
                e.preventDefault();
                go(hits[active]);
              }
            }}
            placeholder="Buscar cliente, oportunidad o presupuesto…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted2"
          />
          <kbd className="shrink-0 rounded border border-border2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {query.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Escribí al menos 2 letras. Abrís esta búsqueda con{" "}
              <kbd className="rounded border border-border2 px-1 text-[11px]">Ctrl</kbd>{" "}
              + <kbd className="rounded border border-border2 px-1 text-[11px]">K</kbd>{" "}
              desde cualquier pantalla.
            </p>
          ) : loading && hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Buscando…
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Sin resultados para “{query.trim()}”.
            </p>
          ) : (
            <ul>
              {hits.map((h, i) => (
                <li key={`${h.kind}-${h.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm ${
                      i === active ? "bg-hoverbg" : ""
                    }`}
                  >
                    <span aria-hidden>{KIND_ICONS[h.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{h.title}</span>
                      {h.subtitle && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {h.subtitle}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {KIND_LABELS[h.kind]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

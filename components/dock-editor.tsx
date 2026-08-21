"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ICON_PATHS, APP_GROUP_LABELS, APP_GROUP_ORDER, DOCK_MAX, type NavItem } from "@/lib/nav-registry";
import { saveDock } from "@/app/(app)/apps/actions";
import { cn } from "@/lib/utils";

/** Evento para abrir el editor desde el dock o el lanzador. */
export const DOCK_EDITOR_EVENT = "rc:editar-accesos";

function Icon({ d, size = 16, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

/**
 * Editor de la barra de accesos rápidos: cada usuario elige qué apps van en
 * el dock (y en la barra inferior del celular) y en qué orden. Se guarda en
 * su usuario, así es la misma barra en la compu y en el teléfono.
 */
export function DockEditor({
  items,
  defaultHrefs,
}: {
  items: NavItem[];
  /** Barra por defecto del sistema (para "Restablecer"). */
  defaultHrefs: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Arranca con la barra actual (lo marcado como pinned, en su orden).
  function openEditor() {
    const current = items
      .filter((i) => i.pinned)
      .sort((a, b) => (a.dockOrder ?? 99) - (b.dockOrder ?? 99))
      .map((i) => i.href);
    setSelected(current);
    setError(null);
    setOpen(true);
  }

  useEffect(() => {
    const onOpen = () => openEditor();
    window.addEventListener(DOCK_EDITOR_EVENT, onOpen);
    return () => window.removeEventListener(DOCK_EDITOR_EVENT, onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const byHref = new Map(items.map((i) => [i.href, i]));

  function toggle(href: string) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(href)) return prev.filter((h) => h !== href);
      if (prev.length >= DOCK_MAX) {
        setError(`La barra admite hasta ${DOCK_MAX} accesos. Quitá uno para agregar otro.`);
        return prev;
      }
      return [...prev, href];
    });
  }
  function move(href: string, dir: -1 | 1) {
    setSelected((prev) => {
      const i = prev.indexOf(href);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function save(hrefs: string[]) {
    startTransition(async () => {
      try {
        await saveDock(hrefs);
        setOpen(false);
        router.refresh();
      } catch {
        setError("No se pudo guardar. Probá de nuevo.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[1250] flex items-start justify-center bg-black/40 p-3 pt-[8vh] backdrop-blur-[2px]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Editar accesos rápidos"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[84vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[18px] border border-border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">Accesos rápidos</h2>
            <p className="text-xs text-muted-foreground">
              Elegí qué apps van en la barra de abajo y en qué orden (hasta {DOCK_MAX}).
              En el celular se muestran las primeras 4.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-chip px-2.5 py-1 text-[12px] font-semibold tabular-nums text-text2">
            {selected.length}/{DOCK_MAX}
          </span>
        </div>

        <div className="grid gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_260px]">
          {/* Todas las apps, por grupo: marcar / desmarcar */}
          <div className="space-y-4">
            {APP_GROUP_ORDER.map((group) => {
              const apps = items.filter((i) => i.group === group);
              if (apps.length === 0) return null;
              return (
                <section key={group}>
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {APP_GROUP_LABELS[group]}
                  </h3>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {apps.map((item) => {
                      const on = selected.includes(item.href);
                      return (
                        <label
                          key={item.href}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-[13px] transition-colors",
                            on ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-hoverbg"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(item.href)}
                            className="h-4 w-4 accent-[var(--primary)]"
                          />
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-white" style={{ background: item.color }}>
                            <Icon size={15} d={ICON_PATHS[item.href] ?? ICON_PATHS["/dashboard"]} />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Orden de la barra */}
          <aside className="rounded-[12px] border border-border bg-card p-3">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Tu barra (en orden)
            </h3>
            {selected.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Sin accesos: se usará la barra por defecto.
              </p>
            ) : (
              <ol className="space-y-1">
                {selected.map((href, idx) => {
                  const item = byHref.get(href);
                  if (!item) return null;
                  return (
                    <li key={href} className="flex items-center gap-2 rounded-[8px] bg-background px-2 py-1.5 text-[13px]">
                      <span className="w-4 text-center text-[11px] tabular-nums text-muted-foreground">{idx + 1}</span>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-white" style={{ background: item.color }}>
                        <Icon size={13} d={ICON_PATHS[item.href] ?? ICON_PATHS["/dashboard"]} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <button type="button" onClick={() => move(href, -1)} disabled={idx === 0} title="Subir" className="rounded px-1 text-muted-foreground hover:text-foreground disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => move(href, 1)} disabled={idx === selected.length - 1} title="Bajar" className="rounded px-1 text-muted-foreground hover:text-foreground disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => toggle(href)} title="Quitar" className="rounded px-1 text-muted-foreground hover:text-red-600">✕</button>
                    </li>
                  );
                })}
              </ol>
            )}
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => { setSelected(defaultHrefs); setError(null); }}
            className="text-[12.5px] font-medium text-muted-foreground hover:underline"
          >
            Restablecer la barra por defecto
          </button>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[9px] border border-border px-3.5 py-2 text-[13px] font-medium hover:bg-hoverbg"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => save(selected)}
              className="rounded-[9px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

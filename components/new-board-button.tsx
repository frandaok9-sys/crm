"use client";

import { useEffect, useState, useTransition } from "react";

import { BOARD_TEMPLATES, type BoardTemplateId } from "@/lib/board-templates";
import { createBoard } from "@/app/(app)/pizarra/actions";
import { cn } from "@/lib/utils";

/**
 * "Nueva pizarra" con selector de plantilla: la función más pedida para
 * arrancar de una estructura y no de cero. Elegís plantilla, ponés nombre y
 * se crea; el editor la siembra en el lienzo (y queda como diapositiva).
 */
export function NewBoardButton() {
  const [open, setOpen] = useState(false);
  const [tpl, setTpl] = useState<BoardTemplateId>("blank");
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function create() {
    const fd = new FormData();
    fd.set("title", title);
    fd.set("template", tpl);
    startTransition(() => {
      // createBoard redirige al editor con ?plantilla=… (siembra al abrir).
      void createBoard(fd);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setTpl("blank"); setTitle(""); setOpen(true); }}
        className="h-9 rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
      >
        + Nueva pizarra
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1250] flex items-start justify-center bg-black/40 p-3 pt-[8vh] backdrop-blur-[2px]"
          onMouseDown={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Nueva pizarra"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-[640px] overflow-hidden rounded-[18px] border border-border bg-background shadow-2xl"
          >
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-[15px] font-semibold">Nueva pizarra</h2>
              <p className="text-xs text-muted-foreground">
                Elegí una plantilla para arrancar (podés cambiar todo después).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3">
              {BOARD_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTpl(t.id)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-[12px] border p-3 text-left transition-colors",
                    tpl === t.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:bg-hoverbg"
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-chip text-text2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                      <path d={t.icon} />
                    </svg>
                  </span>
                  <span className="text-[13px] font-semibold">{t.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">{t.hint}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") create(); }}
                maxLength={120}
                placeholder="Nombre de la pizarra (opcional)"
                className="h-9 min-w-0 flex-1 rounded-[9px] border border-border bg-card px-3 text-sm outline-none focus:border-primary/50"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 rounded-[9px] border border-border px-3.5 text-[13px] font-medium hover:bg-hoverbg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={create}
                className="h-9 rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Creando…" : "Crear pizarra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

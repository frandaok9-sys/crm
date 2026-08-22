"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setBoardVisibility } from "@/app/(app)/pizarra/actions";
import { cn } from "@/lib/utils";

export type ShareUser = { id: string; name: string };
export type ShareMode = "private" | "company" | "users";

/**
 * Menú de compartir de una pizarra (solo el dueño): privada, toda la empresa
 * o personas específicas. En "personas" se marca a quiénes. Los que reciben
 * acceso la ven en SOLO LECTURA (pueden duplicarla para editar su copia).
 */
export function BoardShareMenu({
  id,
  initialMode,
  initialUserIds,
  users,
}: {
  id: string;
  initialMode: ShareMode;
  initialUserIds: string[];
  users: ShareUser[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ShareMode>(initialMode);
  const [selected, setSelected] = useState<string[]>(initialUserIds);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

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

  function toggleUser(uid: string) {
    setSelected((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  }

  function apply(nextMode: ShareMode, nextUsers: string[]) {
    startTransition(async () => {
      await setBoardVisibility(id, nextMode, nextMode === "users" ? nextUsers : []);
      setOpen(false);
      router.refresh();
    });
  }

  // Etiqueta del botón según el estado guardado (props), no el borrador.
  const label =
    initialMode === "company"
      ? "Compartida · empresa"
      : initialMode === "users"
        ? `Compartida · ${initialUserIds.length}`
        : "Compartir";
  const active = initialMode !== "private";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => { setMode(initialMode); setSelected(initialUserIds); setOpen((v) => !v); }}
        className={cn(
          "h-8 rounded-[8px] border px-2.5 text-[12px] font-semibold",
          active
            ? "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
            : "border-border bg-card text-muted-foreground hover:bg-hoverbg"
        )}
        title="Elegir quién puede ver esta pizarra"
      >
        {label}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[300px] overflow-hidden rounded-[14px] border border-border bg-card shadow-2xl">
          <div className="border-b border-border2 px-4 py-2.5">
            <p className="text-[13px] font-semibold">¿Quién puede ver esta pizarra?</p>
            <p className="text-[11px] text-muted-foreground">
              Quienes la reciben la ven en solo lectura (pueden duplicarla).
            </p>
          </div>

          <div className="p-2">
            <Option
              checked={mode === "private"}
              onClick={() => setMode("private")}
              title="Privada"
              hint="Solo vos"
            />
            <Option
              checked={mode === "company"}
              onClick={() => setMode("company")}
              title="Toda la empresa"
              hint="Todos los usuarios, solo lectura"
            />
            <Option
              checked={mode === "users"}
              onClick={() => setMode("users")}
              title="Personas específicas"
              hint="Elegís vos a quiénes"
            />

            {mode === "users" && (
              <div className="mt-1 max-h-[200px] overflow-y-auto rounded-[10px] border border-border2 p-1">
                {users.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No hay otros usuarios activos.
                  </p>
                ) : (
                  users.map((u) => (
                    <label
                      key={u.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] hover:bg-hoverbg"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(u.id)}
                        onChange={() => toggleUser(u.id)}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 flex-1 truncate">{u.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border2 px-3 py-2.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium hover:bg-hoverbg"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending || (mode === "users" && selected.length === 0)}
              onClick={() => apply(mode, selected)}
              className="rounded-[8px] bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              title={mode === "users" && selected.length === 0 ? "Elegí al menos una persona" : undefined}
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Option({
  checked,
  onClick,
  title,
  hint,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors",
        checked ? "bg-primary/5" : "hover:bg-hoverbg"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
          checked ? "border-primary" : "border-muted2"
        )}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

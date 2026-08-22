"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";

import { renameBoard, saveBoard, toggleBoardShare } from "@/app/(app)/pizarra/actions";
import { formatDateTimeAR } from "@/lib/dates";
import { cn } from "@/lib/utils";

// Las fuentes del lienzo se sirven desde nuestro propio dominio (public/excalidraw).
if (typeof window !== "undefined") {
  (window as unknown as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
}

// El motor del lienzo solo existe en el navegador (sin render en servidor).
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Cargando la pizarra…
      </div>
    ),
  }
);

/** Documento guardado: elementos, parte del estado y archivos (imágenes). */
export type BoardDocument = {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

const SAVE_DEBOUNCE_MS = 1500;

/**
 * Editor de pizarra (M6) sobre Excalidraw: lienzo infinito con formas,
 * flechas, notas, texto, dibujo a mano e imágenes. Guarda solo (1,5 s
 * después del último cambio), con título editable, compartir con la
 * empresa y modo presentación (pantalla completa, sin herramientas).
 */
export function BoardEditor({
  id,
  title,
  isShared,
  canEdit,
  ownerName,
  updatedAt,
  document: doc,
}: {
  id: string;
  title: string;
  isShared: boolean;
  canEdit: boolean;
  ownerName: string;
  updatedAt: string;
  document: BoardDocument | null;
}) {
  const [name, setName] = useState(title);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date>(new Date(updatedAt));
  const [present, setPresent] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(doc ?? {}));
  const pendingDoc = useRef<BoardDocument | null>(null);

  // Tema: sigue el modo claro/oscuro del CRM.
  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Presentación: pantalla completa; al salir (Esc) vuelve al modo normal.
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setPresent(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const flush = useCallback(async () => {
    const next = pendingDoc.current;
    if (!next) return;
    const json = JSON.stringify(next);
    if (json === lastSaved.current) {
      setStatus("saved");
      return;
    }
    setStatus("saving");
    try {
      const r = await saveBoard(id, next);
      lastSaved.current = json;
      setSavedAt(new Date(r.savedAt));
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [id]);

  // Guardar al salir de la página si quedó algo pendiente.
  useEffect(() => {
    const onLeave = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    };
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      onLeave();
    };
  }, [flush]);

  function onChange(elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) {
    if (!canEdit) return;
    // Solo lo que hace falta para volver a abrir igual (sin zoom ni selección).
    pendingDoc.current = {
      elements: (elements as { isDeleted?: boolean }[]).filter((e) => !e.isDeleted),
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridModeEnabled: appState.gridModeEnabled,
      },
      files,
    };
    if (JSON.stringify(pendingDoc.current) === lastSaved.current) return;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
  }

  async function commitTitle() {
    const clean = name.trim() || "Pizarra sin título";
    setName(clean);
    if (clean !== title) await renameBoard(id, clean);
  }

  function togglePresent() {
    const el = wrapperRef.current;
    if (!present) {
      setPresent(true);
      el?.requestFullscreen?.().catch(() => {});
    } else {
      setPresent(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }
  }

  const statusLabel =
    status === "saving" ? "Guardando…"
    : status === "dirty" ? "Cambios sin guardar…"
    : status === "error" ? "No se pudo guardar — reintentando al próximo cambio"
    : `Guardado ${formatDateTimeAR(savedAt)}`;

  return (
    <div className="-mx-4 -mt-5 flex h-[calc(100dvh-58px)] flex-col lg:-mx-9 lg:-mt-7">
      {/* Barra de la pizarra */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-side px-3 py-2 backdrop-blur-xl lg:px-5">
        <Link
          href="/pizarra"
          className="flex h-8 items-center gap-1 rounded-[8px] border border-border bg-card px-2.5 text-[12.5px] font-semibold hover:bg-hoverbg"
        >
          ← Pizarras
        </Link>
        {canEdit ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            maxLength={120}
            aria-label="Nombre de la pizarra"
            className="h-8 min-w-0 flex-1 rounded-[8px] border border-transparent bg-transparent px-2 text-[15px] font-semibold outline-none hover:border-border focus:border-primary/50 focus:bg-card"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate px-2 text-[15px] font-semibold">{name}</span>
        )}
        <span className="hidden text-[11.5px] text-muted-foreground sm:block" title="Dueño">
          {canEdit ? "" : `De ${ownerName} · solo lectura`}
        </span>
        {canEdit && (
          <span
            className={cn(
              "hidden text-[11.5px] tabular-nums sm:block",
              status === "error" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
            )}
          >
            {statusLabel}
          </span>
        )}
        {canEdit && (
          <form action={toggleBoardShare}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              title={isShared ? "Compartida con toda la empresa (solo lectura). Clic para hacerla privada." : "Privada. Clic para compartirla con toda la empresa (solo lectura)."}
              className={cn(
                "h-8 rounded-[8px] border px-2.5 text-[12px] font-semibold",
                isShared
                  ? "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
                  : "border-border bg-card text-muted-foreground hover:bg-hoverbg"
              )}
            >
              {isShared ? "Compartida" : "Compartir"}
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={togglePresent}
          className="h-8 rounded-[8px] bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
          title="Pantalla completa, sin herramientas (Esc para salir)"
        >
          {present ? "Salir" : "▶ Presentar"}
        </button>
      </div>

      {/* Lienzo */}
      <div ref={wrapperRef} className="min-h-0 flex-1 bg-background">
        <Excalidraw
          langCode="es-ES"
          theme={theme}
          initialData={{
            elements: (doc?.elements ?? []) as never,
            appState: {
              viewBackgroundColor: (doc?.appState?.viewBackgroundColor as string | undefined) ?? (theme === "dark" ? "#121212" : "#ffffff"),
              gridModeEnabled: Boolean(doc?.appState?.gridModeEnabled),
              // Trazo limpio por defecto (no "a mano alzada").
              currentItemRoughness: 0,
              currentItemFontFamily: 2,
            } as never,
            files: (doc?.files ?? {}) as never,
            scrollToContent: true,
          }}
          onChange={(els, st, files) => onChange(els, st as unknown as Record<string, unknown>, files as unknown as Record<string, unknown>)}
          viewModeEnabled={present || !canEdit}
          zenModeEnabled={present}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              clearCanvas: canEdit,
              toggleTheme: false,
              export: { saveFileToDisk: true },
            },
          }}
        />
      </div>
    </div>
  );
}

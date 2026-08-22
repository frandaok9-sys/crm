"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import "@excalidraw/excalidraw/index.css";
import "./board-theme.css";

import { renameBoard, saveBoard, toggleBoardShare } from "@/app/(app)/pizarra/actions";
import { templateSkeleton, type BoardTemplateId } from "@/lib/board-templates";
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

type SceneElement = { type: string; x: number; y: number; isDeleted?: boolean };
type ExcalidrawAPI = {
  getSceneElements: () => readonly SceneElement[];
  updateScene: (scene: { elements: unknown[] }) => void;
  scrollToContent: (target?: unknown, opts?: Record<string, unknown>) => void;
};

const SAVE_DEBOUNCE_MS = 1500;

/**
 * Editor de pizarra (M6, fase 2) sobre Excalidraw: lienzo infinito con
 * formas, flechas, notas, texto, dibujo a mano e imágenes. Guarda solo,
 * título editable, compartir con la empresa, siembra de PLANTILLA al abrir
 * y PRESENTACIÓN por diapositivas (recorre los "cuadros"/frames a pantalla
 * completa, con puntero láser del propio lienzo).
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
  const searchParams = useSearchParams();
  const [name, setName] = useState(title);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date>(new Date(updatedAt));
  const [present, setPresent] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [slide, setSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);

  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<SceneElement[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(doc ?? {}));
  const pendingDoc = useRef<BoardDocument | null>(null);
  const seeded = useRef(false);

  // Tema: sigue el modo claro/oscuro del CRM.
  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Salir de pantalla completa (Esc) vuelve al modo normal.
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

  const queueSave = useCallback(() => {
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  function onChange(
    elements: readonly SceneElement[],
    appState: Record<string, unknown>,
    files: Record<string, unknown>
  ) {
    if (!canEdit) return;
    pendingDoc.current = {
      elements: elements.filter((e) => !e.isDeleted),
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridModeEnabled: appState.gridModeEnabled,
      },
      files,
    };
    if (JSON.stringify(pendingDoc.current) === lastSaved.current) return;
    queueSave();
  }

  // Siembra de plantilla al abrir (?plantilla=…): solo si la pizarra está
  // vacía. convertToExcalidrawElements corre en el navegador.
  const onApiReady = useCallback(
    (api: ExcalidrawAPI) => {
      apiRef.current = api;
      if (seeded.current || !canEdit) return;
      const tpl = searchParams.get("plantilla") as BoardTemplateId | null;
      // Limpiar el parámetro sin recargar.
      if (tpl) window.history.replaceState(null, "", `/pizarra/${id}`);
      if (!tpl) return;
      seeded.current = true;
      if (api.getSceneElements().length > 0) return; // ya tenía contenido
      const skeleton = templateSkeleton(tpl);
      if (skeleton.length === 0) return;
      void (async () => {
        try {
          const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
          const elements = convertToExcalidrawElements(skeleton as never);
          api.updateScene({ elements: elements as unknown[] });
          api.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.8 });
          queueSave();
        } catch {
          /* si la plantilla falla, la pizarra queda en blanco */
        }
        return;
      })();
    },
    [canEdit, id, searchParams, queueSave]
  );

  async function commitTitle() {
    const clean = name.trim() || "Pizarra sin título";
    setName(clean);
    if (clean !== title) await renameBoard(id, clean);
  }

  // ---- Presentación por diapositivas (frames) ----
  const gotoSlide = useCallback((i: number) => {
    const frames = framesRef.current;
    const f = frames[i];
    if (!f || !apiRef.current) return;
    setSlide(i);
    apiRef.current.scrollToContent(f, {
      fitToViewport: true,
      viewportZoomFactor: 0.95,
      animate: true,
      duration: 350,
    });
  }, []);

  function startPresent() {
    const frames = (apiRef.current?.getSceneElements() ?? [])
      .filter((e) => e.type === "frame")
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x);
    framesRef.current = frames;
    setSlideCount(frames.length);
    setPresent(true);
    wrapperRef.current?.requestFullscreen?.().catch(() => {});
    if (frames.length > 0) {
      setSlide(0);
      setTimeout(() => gotoSlide(0), 120);
    }
  }
  function stopPresent() {
    setPresent(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  // Teclado en presentación: Escape sale (aunque el navegador no haya entrado
  // en pantalla completa), flechas/espacio recorren las diapositivas.
  useEffect(() => {
    if (!present) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        stopPresent();
      } else if (slideCount > 0 && (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown")) {
        e.preventDefault();
        gotoSlide(Math.min(slide + 1, slideCount - 1));
      } else if (slideCount > 0 && (e.key === "ArrowLeft" || e.key === "PageUp")) {
        e.preventDefault();
        gotoSlide(Math.max(slide - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, slide, slideCount, gotoSlide]);

  const statusLabel =
    status === "saving" ? "Guardando…"
    : status === "dirty" ? "Cambios sin guardar…"
    : status === "error" ? "No se pudo guardar — reintenta al próximo cambio"
    : `Guardado ${formatDateTimeAR(savedAt)}`;

  return (
    <div className="-mx-4 -mt-5 flex h-[calc(100dvh-58px)] flex-col lg:-mx-9 lg:-mt-7">
      {/* Barra de la pizarra (se oculta en presentación) */}
      {!present && (
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
          {!canEdit && (
            <span className="hidden text-[11.5px] text-muted-foreground sm:block" title="Dueño">
              De {ownerName} · solo lectura
            </span>
          )}
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
            onClick={startPresent}
            className="h-8 rounded-[8px] bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
            title="Pantalla completa; recorre los cuadros como diapositivas (Esc para salir)"
          >
            ▶ Presentar
          </button>
        </div>
      )}

      {/* Lienzo */}
      <div ref={wrapperRef} className="rc-board relative min-h-0 flex-1 bg-background">
        <Excalidraw
          excalidrawAPI={onApiReady as never}
          langCode="es-ES"
          theme={theme}
          initialData={{
            elements: (doc?.elements ?? []) as never,
            appState: {
              // Estilo Lucid: el fondo real (gris claro + puntitos suaves) lo
              // dibuja el CSS del contenedor (.rc-board); el lienzo va
              // transparente para dejarlos ver. Las pizarras guardadas con un
              // color propio lo conservan.
              viewBackgroundColor: (doc?.appState?.viewBackgroundColor as string | undefined) ?? "transparent",
              // Grilla de LÍNEAS de Excalidraw apagada (era muy marcada); usamos
              // los puntos del CSS.
              gridModeEnabled: Boolean(doc?.appState?.gridModeEnabled),
              currentItemRoughness: 0,
              currentItemFontFamily: 2,
            } as never,
            files: (doc?.files ?? {}) as never,
            scrollToContent: true,
          }}
          onChange={(els, st, files) => onChange(els as readonly SceneElement[], st as unknown as Record<string, unknown>, files as unknown as Record<string, unknown>)}
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

        {/* Controles de presentación (superpuestos) */}
        {present && (
          <>
            <button
              type="button"
              onClick={stopPresent}
              className="absolute right-4 top-4 z-20 rounded-[8px] bg-black/70 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-black/85"
            >
              Salir ✕
            </button>
            {slideCount > 0 ? (
              <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 px-3 py-2 text-white shadow-lg">
                <button
                  type="button"
                  onClick={() => gotoSlide(Math.max(slide - 1, 0))}
                  disabled={slide === 0}
                  className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-30"
                  aria-label="Diapositiva anterior"
                >
                  ‹
                </button>
                <span className="text-[12.5px] font-semibold tabular-nums">
                  Diapositiva {slide + 1} / {slideCount}
                </span>
                <button
                  type="button"
                  onClick={() => gotoSlide(Math.min(slide + 1, slideCount - 1))}
                  disabled={slide === slideCount - 1}
                  className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-30"
                  aria-label="Diapositiva siguiente"
                >
                  ›
                </button>
              </div>
            ) : (
              <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[12px] text-white">
                Sin cuadros. Usá la herramienta <b>Marco</b> (Frame) para armar diapositivas.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

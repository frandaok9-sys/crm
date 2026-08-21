"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

import { InitialsAvatar } from "@/components/initials-avatar";
import { moveOpportunity, togglePin } from "@/app/(app)/oportunidades/actions";

export type BoardCard = {
  id: string;
  title: string;
  clientName: string;
  amountLabel: string | null;
  m2Label: string | null;
  ownerName: string | null;
  ownerTint: string | null;
  isPinned: boolean;
  /** Tengo una tarea abierta acá: la tarjeta está en mi pipeline por eso. */
  hasMyTask?: boolean;
};

export type BoardColumn = {
  id: string;
  name: string;
  hex: string; // color de etapa (handoff)
  totalLabel: string | null; // total monetario compacto
  opportunities: BoardCard[];
};

export function PipelineBoard({
  columns,
  canEdit,
}: {
  columns: BoardColumn[];
  canEdit: boolean;
}) {
  const [board, setBoard] = useState(columns);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // Desplazamiento lateral desde ARRIBA: una barra espejo (sincronizada con
  // la del tablero) que queda pegada arriba al bajar, más flechas ‹ › para
  // moverse de a una columna. Así no hay que bajar hasta el final del
  // tablero para desplazarse de costado.
  const boardRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => {
      setScrollWidth(el.scrollWidth);
      setHasOverflow(el.scrollWidth > el.clientWidth + 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [board]);

  function syncFrom(source: "board" | "mirror") {
    if (syncing.current) return;
    const b = boardRef.current;
    const m = mirrorRef.current;
    if (!b || !m) return;
    syncing.current = true;
    if (source === "board") m.scrollLeft = b.scrollLeft;
    else b.scrollLeft = m.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }

  function scrollByColumn(dir: -1 | 1) {
    // Una columna (276px) + separación (14px).
    boardRef.current?.scrollBy({ left: dir * 290, behavior: "smooth" });
  }

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    let orderedIds: string[] = [];
    setBoard((prev) => {
      const next = prev.map((col) => ({
        ...col,
        opportunities: [...col.opportunities],
      }));
      const from = next.find((c) => c.id === source.droppableId);
      const to = next.find((c) => c.id === destination.droppableId);
      if (!from || !to) return prev;
      const [moved] = from.opportunities.splice(source.index, 1);
      to.opportunities.splice(destination.index, 0, moved);
      orderedIds = to.opportunities.map((o) => o.id);
      return next;
    });

    startTransition(() => {
      moveOpportunity(draggableId, destination.droppableId, orderedIds).catch(
        () => router.refresh()
      );
    });
  }

  // Móvil: arrastrar tarjetas con el dedo es incómodo; cada tarjeta tiene
  // un selector "Mover a…" que usa la MISMA acción que el arrastre.
  function moveToStage(cardId: string, fromId: string, toId: string) {
    if (fromId === toId) return;
    let orderedIds: string[] = [];
    setBoard((prev) => {
      const next = prev.map((col) => ({
        ...col,
        opportunities: [...col.opportunities],
      }));
      const from = next.find((c) => c.id === fromId);
      const to = next.find((c) => c.id === toId);
      if (!from || !to) return prev;
      const idx = from.opportunities.findIndex((o) => o.id === cardId);
      if (idx < 0) return prev;
      const [moved] = from.opportunities.splice(idx, 1);
      to.opportunities.push(moved);
      orderedIds = to.opportunities.map((o) => o.id);
      return next;
    });
    startTransition(() => {
      moveOpportunity(cardId, toId, orderedIds).catch(() => router.refresh());
    });
  }

  function handlePin(cardId: string) {
    setBoard((prev) =>
      prev.map((col) => ({
        ...col,
        opportunities: col.opportunities.map((o) =>
          o.id === cardId ? { ...o, isPinned: !o.isPinned } : o
        ),
      }))
    );
    startTransition(() => {
      togglePin(cardId).catch(() => router.refresh());
    });
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      {/* Barra superior de desplazamiento (espejo) + flechas. Pegada arriba
          mientras se baja por las columnas. Solo si el tablero desborda. */}
      {hasOverflow && (
        <div className="sticky top-0 z-20 -mx-1 mb-2 bg-background/95 px-1 pb-1 pt-1 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollByColumn(-1)}
              title="Columna anterior"
              aria-label="Desplazar a la izquierda"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-border bg-card text-text2 transition-colors hover:bg-hoverbg"
            >
              ‹
            </button>
            <div
              ref={mirrorRef}
              onScroll={() => syncFrom("mirror")}
              title="Deslizá para mover el tablero"
              className="h-3.5 min-w-0 flex-1 overflow-x-auto overflow-y-hidden rounded-full border border-border2 bg-card2 [scrollbar-width:thin]"
            >
              <div style={{ width: scrollWidth }} className="h-px" />
            </div>
            <button
              type="button"
              onClick={() => scrollByColumn(1)}
              title="Columna siguiente"
              aria-label="Desplazar a la derecha"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-border bg-card text-text2 transition-colors hover:bg-hoverbg"
            >
              ›
            </button>
          </div>
        </div>
      )}
      <div
        ref={boardRef}
        onScroll={() => syncFrom("board")}
        className="flex gap-[14px] overflow-x-auto pb-4"
      >
        {board.map((col) => (
          <div key={col.id} className="w-[276px] flex-shrink-0">
            {/* Header de columna */}
            <div className="mb-2 flex items-center gap-2 px-1">
              <h2 className="font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-text2">
                {col.name}
              </h2>
              <span
                className="rounded-[10px] px-1.5 py-px text-[11px] font-bold tabular-nums"
                style={{ color: col.hex, background: `${col.hex}29` }}
              >
                {col.opportunities.length}
              </span>
              {col.totalLabel && (
                <span className="ml-auto text-[11.5px] tabular-nums text-muted2">
                  {col.totalLabel}
                </span>
              )}
            </div>

            {/* Contenedor */}
            <Droppable droppableId={col.id}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="min-h-[140px] rounded-[12px] border border-border2 bg-panel p-2"
                  style={{ borderTop: `3px solid ${col.hex}` }}
                >
                  <div className="space-y-2">
                    {col.opportunities.map((card, index) => (
                      <Draggable
                        key={card.id}
                        draggableId={card.id}
                        index={index}
                        isDragDisabled={!canEdit}
                      >
                        {(prov, snapshot) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            className={`group rounded-[10px] border bg-card2 px-[14px] py-[13px] transition-all duration-150 hover:-translate-y-0.5 hover:border-avbd hover:shadow-[var(--shadow-panel)] ${
                              snapshot.isDragging
                                ? "border-avbd shadow-[var(--shadow-panel)]"
                                : "border-border"
                            }`}
                            style={{
                              borderLeft: `3px solid ${col.hex}`,
                              ...(card.isPinned
                                ? { outline: "1px solid #D9A03C" }
                                : {}),
                              ...prov.draggableProps.style,
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[13.5px] font-bold leading-snug">
                                {card.title}
                              </p>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => handlePin(card.id)}
                                  title={
                                    card.isPinned ? "Quitar fijado" : "Fijar"
                                  }
                                  className={`text-[13px] leading-none transition-opacity ${
                                    card.isPinned
                                      ? "opacity-100"
                                      : "opacity-25 hover:opacity-70"
                                  }`}
                                >
                                  📌
                                </button>
                              )}
                            </div>
                            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                              <span className="truncate">{card.clientName}</span>
                              {card.m2Label && (
                                <span className="shrink-0 rounded-[10px] bg-chip px-1.5 py-px text-[10.5px] font-medium text-text2">
                                  {card.m2Label}
                                </span>
                              )}
                            </p>
                            {/* Está en mi pipeline porque me delegaron una
                                tarea acá; se va cuando la confirmo. */}
                            {card.hasMyTask && (
                              <p className="mt-1.5 inline-flex items-center gap-1 rounded-[10px] bg-primary/10 px-1.5 py-px text-[10.5px] font-semibold text-primary">
                                ✋ Tarea tuya pendiente
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-[14.5px] font-extrabold tabular-nums">
                                {card.amountLabel ?? ""}
                              </span>
                              {card.ownerName && (
                                <InitialsAvatar
                                  name={card.ownerName}
                                  size={24}
                                  tint={card.ownerTint ?? undefined}
                                />
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <Link
                                href={`/oportunidades/${card.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[12px] font-semibold text-primary hover:underline"
                              >
                                Ver / alertas →
                              </Link>
                              {canEdit && board.length > 1 && (
                                <select
                                  aria-label="Mover de etapa"
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value)
                                      moveToStage(
                                        card.id,
                                        col.id,
                                        e.target.value
                                      );
                                  }}
                                  className="max-w-[132px] rounded-[8px] border border-border bg-field px-1.5 py-1 text-[12px] text-muted-foreground lg:hidden"
                                >
                                  <option value="">Mover a…</option>
                                  {board
                                    .filter((c) => c.id !== col.id)
                                    .map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                </select>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>

                  {canEdit && (
                    <Link
                      href="/oportunidades/nueva"
                      className="mt-2 block rounded-[9px] border border-dashed border-avbd px-3 py-2 text-center text-[12px] text-muted2 transition-colors hover:border-muted-foreground hover:text-text2"
                    >
                      ＋ Agregar oportunidad
                    </Link>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}

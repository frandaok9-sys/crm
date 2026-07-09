"use client";

import { useState, useTransition } from "react";
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
      <div className="flex gap-[14px] overflow-x-auto pb-4">
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
                            <Link
                              href={`/oportunidades/${card.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 block text-[12px] font-semibold text-primary hover:underline"
                            >
                              Ver / alertas →
                            </Link>
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

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

import { moveOpportunity, togglePin } from "@/app/(app)/oportunidades/actions";

export type BoardCard = {
  id: string;
  title: string;
  clientName: string;
  amountLabel: string | null;
  m2Label: string | null;
  ownerName: string | null;
  isPinned: boolean;
};

export type BoardColumn = {
  id: string;
  name: string;
  color: string;
  opportunities: BoardCard[];
};

const DOT: Record<string, string> = {
  gray: "bg-zinc-400",
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
};

const BORDER: Record<string, string> = {
  gray: "border-l-zinc-400",
  red: "border-l-red-500",
  amber: "border-l-amber-500",
  green: "border-l-emerald-500",
  blue: "border-l-blue-500",
  purple: "border-l-purple-500",
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
      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.map((col) => {
          const border = BORDER[col.color] ?? BORDER.gray;
          return (
            <div key={col.id} className="w-72 flex-shrink-0">
              <div className="mb-2 flex items-center gap-2 px-1">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${DOT[col.color] ?? DOT.gray}`}
                />
                <h2 className="text-sm font-semibold">{col.name}</h2>
                <span className="text-xs text-zinc-400">
                  {col.opportunities.length}
                </span>
              </div>

              <Droppable droppableId={col.id}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="min-h-24 space-y-2 rounded-xl border bg-zinc-50 p-2 dark:bg-zinc-900/50"
                  >
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
                            className={`rounded-lg border border-l-4 bg-white p-3 shadow-sm dark:bg-zinc-900 ${border} ${
                              snapshot.isDragging ? "ring-2 ring-primary" : ""
                            } ${card.isPinned ? "ring-1 ring-amber-400" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-tight">
                                {card.title}
                              </p>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => handlePin(card.id)}
                                  title={
                                    card.isPinned ? "Quitar fijado" : "Fijar"
                                  }
                                  className={`text-sm ${
                                    card.isPinned
                                      ? ""
                                      : "opacity-30 hover:opacity-70"
                                  }`}
                                >
                                  📌
                                </button>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-zinc-500">
                              {card.clientName}
                              {card.m2Label && (
                                <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                  {card.m2Label}
                                </span>
                              )}
                            </p>
                            <div className="mt-2 flex items-center justify-between">
                              {card.amountLabel && (
                                <span className="text-sm font-semibold">
                                  {card.amountLabel}
                                </span>
                              )}
                              {card.ownerName && (
                                <span className="text-xs text-zinc-400">
                                  {card.ownerName}
                                </span>
                              )}
                            </div>
                            <Link
                              href={`/oportunidades/${card.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 block text-xs text-primary hover:underline"
                            >
                              Ver / alertas →
                            </Link>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}

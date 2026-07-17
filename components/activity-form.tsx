"use client";

import { useState } from "react";

import { addActivity } from "@/app/(app)/clientes/actions";
import { ACTIVITY_TYPE_LABELS } from "@/lib/activities";
import { ClientActivityType } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

const TYPES = [
  ClientActivityType.CALL,
  ClientActivityType.VISIT,
  ClientActivityType.EMAIL,
  ClientActivityType.NOTE,
  ClientActivityType.TASK,
] as const;

/**
 * Alta rápida de una actividad del cliente. El selector de tipo es un grupo de
 * botones; al elegir "Tarea" aparece el campo de fecha límite.
 */
export function ActivityForm({ clientId }: { clientId: string }) {
  const [type, setType] = useState<ClientActivityType>(ClientActivityType.CALL);
  const isTask = type === ClientActivityType.TASK;

  return (
    <form action={addActivity} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="type" value={type} />

      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              type === t
                ? "border-primary bg-primary/10 text-primary"
                : "border-zinc-300 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {ACTIVITY_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          name="title"
          required
          maxLength={200}
          placeholder={
            isTask
              ? "Qué hay que hacer… (ej: llamar para pasar precios)"
              : "Qué pasó… (ej: pidió cotización para 500 m²)"
          }
          className={inputClass}
        />
        {isTask && (
          <label className="block">
            <input
              type="date"
              name="dueAt"
              aria-label="Fecha límite"
              className={inputClass}
            />
          </label>
        )}
      </div>

      <textarea
        name="notes"
        rows={2}
        placeholder="Detalle (opcional)"
        className={inputClass}
      />

      <div className="flex justify-end">
        <Button type="submit" variant="outline">
          {isTask ? "Crear tarea" : "Registrar actividad"}
        </Button>
      </div>
    </form>
  );
}

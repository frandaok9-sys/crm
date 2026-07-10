"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { STAGE_HEX, stageHex } from "@/lib/stage-colors";
import { Button } from "@/components/ui/button";
import {
  createStage,
  updateStage,
  moveStage,
  deleteStage,
} from "@/app/(app)/admin/actions";

export type StageRow = {
  id: string;
  name: string;
  color: string;
  count: number;
};

const COLOR_LABELS: Record<string, string> = {
  gray: "Gris",
  blue: "Azul",
  amber: "Ámbar",
  purple: "Violeta",
  green: "Verde",
  red: "Rojo",
};
const COLORS = Object.keys(STAGE_HEX);

const INPUT =
  "rounded-[8px] border border-border bg-field px-2.5 py-1.5 text-[13px] outline-none focus:border-muted-foreground";

export function AdminPipelineSection({ stages }: { stages: StageRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("gray");
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="max-w-[720px] space-y-4">
      <p className="text-sm text-muted-foreground">
        Las etapas son las columnas del tablero de oportunidades. Cambiá nombre,
        color u orden. No se puede eliminar una etapa que tenga oportunidades.
      </p>

      {error && (
        <div className="rounded-[10px] border border-destructive/35 bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <section className="space-y-2">
        {stages.map((stage, i) => (
          <StageEditor
            key={stage.id}
            stage={stage}
            isFirst={i === 0}
            isLast={i === stages.length - 1}
            disabled={isPending}
            onRun={run}
          />
        ))}
      </section>

      {/* Alta */}
      <div className="flex flex-wrap items-end gap-2.5 rounded-[12px] border border-dashed border-avbd bg-card2 p-3.5">
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ background: stageHex(newColor) }}
        />
        <input
          className={`${INPUT} flex-1 min-w-[160px]`}
          placeholder="Nombre de la nueva etapa"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <select className={INPUT} value={newColor} onChange={(e) => setNewColor(e.target.value)}>
          {COLORS.map((c) => (
            <option key={c} value={c}>
              {COLOR_LABELS[c]}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={isPending || !newName.trim()}
          onClick={() =>
            run(async () => {
              await createStage(newName, newColor);
              setNewName("");
              setNewColor("gray");
            })
          }
        >
          + Agregar etapa
        </Button>
      </div>
    </div>
  );
}

function StageEditor({
  stage,
  isFirst,
  isLast,
  disabled,
  onRun,
}: {
  stage: StageRow;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onRun: (fn: () => Promise<void>) => void;
}) {
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);
  const dirty = name !== stage.name || color !== stage.color;

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border bg-card px-3.5 py-2.5">
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-full"
        style={{ background: stageHex(color) }}
      />
      <input
        className={`${INPUT} flex-1 min-w-[140px]`}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select className={INPUT} value={color} onChange={(e) => setColor(e.target.value)}>
        {COLORS.map((c) => (
          <option key={c} value={c}>
            {COLOR_LABELS[c]}
          </option>
        ))}
      </select>

      <span className="min-w-[74px] text-center text-[11.5px] text-muted-foreground tabular-nums">
        {stage.count} opor.
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled || isFirst}
          onClick={() => onRun(() => moveStage(stage.id, "up"))}
          className="rounded-[6px] border border-border px-2 py-1 text-[12px] text-text2 transition-colors hover:bg-hoverbg disabled:opacity-30"
          title="Subir"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={disabled || isLast}
          onClick={() => onRun(() => moveStage(stage.id, "down"))}
          className="rounded-[6px] border border-border px-2 py-1 text-[12px] text-text2 transition-colors hover:bg-hoverbg disabled:opacity-30"
          title="Bajar"
        >
          ↓
        </button>
      </div>

      {dirty && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onRun(() => updateStage(stage.id, name, color))}
        >
          Guardar
        </Button>
      )}

      <button
        type="button"
        disabled={disabled || stage.count > 0}
        onClick={() => onRun(() => deleteStage(stage.id))}
        className="rounded-[6px] px-2 py-1 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-30"
        title={stage.count > 0 ? "Tiene oportunidades" : "Eliminar"}
      >
        Eliminar
      </button>
    </div>
  );
}

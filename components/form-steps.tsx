"use client";

import { useRef, useState } from "react";

/**
 * Carga por etapas dentro de UN mismo formulario: pestañas numeradas que
 * muestran/ocultan secciones. Los campos ocultos siguen enviándose al
 * guardar (hidden no deshabilita inputs), así que se puede saltar entre
 * etapas sin perder nada y guardar desde cualquiera.
 *
 * Si al guardar hay un campo obligatorio inválido en una etapa OCULTA, el
 * navegador cancelaría el envío sin mostrar nada (no puede enfocar un
 * control oculto): acá se captura el evento `invalid`, se salta a la etapa
 * del campo y se vuelve a pedir la validación para que el aviso se vea.
 */
export function FormSteps({
  labels,
  panes,
}: {
  labels: string[];
  panes: React.ReactNode[];
}) {
  const [active, setActive] = useState(0);
  const paneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const revalidating = useRef(false);

  function onInvalidCapture(e: React.FormEvent) {
    const target = e.target as HTMLElement;
    const idx = paneRefs.current.findIndex((p) => p && p.contains(target));
    if (idx >= 0 && idx !== active && !revalidating.current) {
      setActive(idx);
      revalidating.current = true;
      // Con la etapa ya visible, repetir la validación muestra el globo.
      setTimeout(() => {
        target.closest("form")?.reportValidity();
        revalidating.current = false;
      }, 50);
    }
  }

  function onKeyDownCapture(e: React.KeyboardEvent) {
    // Enter en un input de una línea dispararía el guardado implícito del
    // formulario (guardar a medias sin querer). Los textarea y botones no
    // se ven afectados.
    const t = e.target as HTMLElement;
    if (e.key === "Enter" && t.tagName === "INPUT") {
      e.preventDefault();
    }
  }

  return (
    <div onInvalidCapture={onInvalidCapture} onKeyDownCapture={onKeyDownCapture}>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setActive(i)}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              active === i
                ? "border-primary bg-primary/10 text-primary"
                : "border-zinc-300 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                active === i
                  ? "bg-primary text-primary-foreground"
                  : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700"
              }`}
            >
              {i + 1}
            </span>
            {label}
          </button>
        ))}
      </div>

      {panes.map((pane, i) => (
        <div
          key={i}
          ref={(el) => {
            paneRefs.current[i] = el;
          }}
          hidden={active !== i}
        >
          {pane}
        </div>
      ))}

      <div className="mt-5 flex items-center justify-between">
        {active > 0 ? (
          <button
            type="button"
            onClick={() => setActive(active - 1)}
            className="text-sm text-zinc-500 hover:underline"
          >
            ← {labels[active - 1]}
          </button>
        ) : (
          <span />
        )}
        {active < labels.length - 1 && (
          <button
            type="button"
            onClick={() => setActive(active + 1)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {labels[active + 1]} →
          </button>
        )}
      </div>
    </div>
  );
}

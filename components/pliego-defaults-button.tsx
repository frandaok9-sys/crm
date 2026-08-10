"use client";

import { useRef } from "react";

/**
 * Completa los campos del pliego con los textos estándar de RC — solo los
 * que estén vacíos, y solo cuando el usuario lo pide con un clic. Así un
 * presupuesto simple nunca sale con condiciones que nadie revisó.
 */
export function PliegoDefaultsButton({
  defaults,
}: {
  defaults: Record<string, string>;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  function fill() {
    const form = ref.current?.closest("form");
    if (!form) return;
    for (const [name, text] of Object.entries(defaults)) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLTextAreaElement && field.value.trim() === "") {
        field.value = text;
      }
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={fill}
      className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
    >
      Usar textos estándar de RC
    </button>
  );
}

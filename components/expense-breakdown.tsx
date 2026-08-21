"use client";

import { useState } from "react";

import { TAX_LABEL_SUGGESTIONS } from "@/lib/expense-calc";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

type Line = { label: string; amount: string };

/** Mismo criterio lenient que el servidor, solo para el total en pantalla. */
function parseLoose(raw: string): number {
  let s = raw.trim().replace(/[$\s]/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Desglose del gasto (M5): importe neto + agregados/impuestos (líneas con
 * nombre e importe) = total de la factura, calculado en vivo. El servidor
 * recalcula todo en Decimal (lib/expense-calc): esto es solo la pantalla.
 * Los nombres de campo se repiten (taxLabel / taxAmount) y el servidor los
 * empareja por posición.
 */
export function ExpenseBreakdown({
  symbol,
  defaultNet = "",
  defaultTaxes = [],
}: {
  symbol: string;
  defaultNet?: string;
  defaultTaxes?: Line[];
}) {
  const [net, setNet] = useState(defaultNet);
  const [lines, setLines] = useState<Line[]>(
    defaultTaxes.length > 0 ? defaultTaxes : []
  );

  const total =
    parseLoose(net) + lines.reduce((acc, l) => acc + parseLoose(l.amount), 0);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  return (
    <div className="grid gap-3 sm:col-span-3 sm:grid-cols-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Importe neto *
        </span>
        <input
          name="netAmount"
          required
          inputMode="decimal"
          placeholder="100.000,00"
          value={net}
          onChange={(e) => setNet(e.target.value)}
          className={inputClass}
        />
        <span className="mt-1 block text-[11px] text-zinc-400">
          Sin impuestos. Si el gasto no tiene desglose, el neto es el total.
        </span>
      </label>

      <div className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Agregados / impuestos
        </span>
        <datalist id="tax-label-suggestions">
          {TAX_LABEL_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                name="taxLabel"
                list="tax-label-suggestions"
                placeholder="Ej: IVA 21%, percepción IIBB…"
                value={line.label}
                onChange={(e) => updateLine(i, { label: e.target.value })}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <input
                name="taxAmount"
                inputMode="decimal"
                placeholder="0,00"
                value={line.amount}
                onChange={(e) => updateLine(i, { amount: e.target.value })}
                className={`${inputClass} w-[130px] shrink-0 text-right`}
              />
              <button
                type="button"
                title="Quitar"
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                className="shrink-0 text-zinc-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, { label: "", amount: "" }])}
            className="rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:border-primary hover:text-primary dark:border-zinc-700"
          >
            + Agregar impuesto / agregado
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 sm:col-span-3 dark:border-zinc-700 dark:bg-zinc-800/60">
        <span className="text-xs font-medium text-zinc-500">Total de la factura</span>
        <p className="text-lg font-bold tabular-nums">
          {symbol}{" "}
          {total.toLocaleString("es-AR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
        <span className="text-[11px] text-zinc-400">
          Se calcula solo: neto + impuestos. Es lo que se registra como gasto.
        </span>
      </div>
    </div>
  );
}

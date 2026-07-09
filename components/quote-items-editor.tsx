"use client";

import { useMemo, useState } from "react";

import { computeQuoteTotals } from "@/lib/quotes-calc";

export type QuoteRow = {
  type: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  ivaRate: string;
};

/** Units used in industrial flooring quotes (m² is the default). */
export const UNITS = ["m²", "un", "h", "ml", "kg", "global"] as const;

type TaxRateOption = { rate: string; name: string };

const cell =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

const TYPE_LABELS: Record<string, string> = {
  PRODUCT: "Producto",
  SERVICE: "Servicio",
  TEXT: "Texto libre",
};

function sanitize(value: string): string {
  const s = value.trim();
  if (s.includes(",") && s.includes(".")) {
    return s.replace(/\./g, "").replace(",", ".");
  }
  if (s.includes(",")) return s.replace(",", ".");
  return s;
}

export function QuoteItemsEditor({
  taxRates,
  defaultRate,
  currencySymbol,
  initial,
}: {
  taxRates: TaxRateOption[];
  defaultRate: string;
  currencySymbol: string;
  initial?: QuoteRow[];
}) {
  const [rows, setRows] = useState<QuoteRow[]>(
    initial && initial.length > 0
      ? initial
      : [
          {
            type: "SERVICE",
            description: "",
            quantity: "1",
            unit: "m²",
            unitPrice: "0",
            ivaRate: defaultRate,
          },
        ]
  );

  function update(index: number, patch: Partial<QuoteRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        type: "SERVICE",
        description: "",
        quantity: "1",
        unit: "m²",
        unitPrice: "0",
        ivaRate: defaultRate,
      },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const totals = useMemo(() => {
    try {
      return computeQuoteTotals(
        rows.map((r) => ({
          quantity: sanitize(r.quantity || "0"),
          unitPrice: sanitize(r.unitPrice || "0"),
          ivaRate: sanitize(r.ivaRate || "0"),
        }))
      );
    } catch {
      return null;
    }
  }, [rows]);

  const fmt = (v: string) =>
    `${currencySymbol} ${Number(v).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div>
      <input type="hidden" name="items" value={JSON.stringify(rows)} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500">
              <th className="px-1 py-2 font-medium">Tipo</th>
              <th className="px-1 py-2 font-medium">Descripción</th>
              <th className="px-1 py-2 font-medium">Cant.</th>
              <th className="px-1 py-2 font-medium">Unidad</th>
              <th className="px-1 py-2 font-medium">P. unitario</th>
              <th className="px-1 py-2 font-medium">IVA</th>
              <th className="px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="px-1 py-1">
                  <select
                    value={row.type}
                    onChange={(e) => update(index, { type: e.target.value })}
                    className={cell}
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    value={row.description}
                    onChange={(e) =>
                      update(index, { description: e.target.value })
                    }
                    placeholder="Detalle"
                    className={`${cell} w-full min-w-40`}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={row.quantity}
                    inputMode="decimal"
                    onChange={(e) => update(index, { quantity: e.target.value })}
                    className={`${cell} w-16`}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={row.unit}
                    onChange={(e) => update(index, { unit: e.target.value })}
                    className={cell}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    value={row.unitPrice}
                    inputMode="decimal"
                    onChange={(e) =>
                      update(index, { unitPrice: e.target.value })
                    }
                    className={`${cell} w-24`}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={row.ivaRate}
                    onChange={(e) => update(index, { ivaRate: e.target.value })}
                    className={cell}
                  >
                    {taxRates.map((t) => (
                      <option key={t.rate} value={t.rate}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="text-zinc-400 hover:text-red-600"
                    title="Quitar ítem"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        + Agregar ítem
      </button>

      {totals && (
        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Neto</span>
              <span>{fmt(totals.net)}</span>
            </div>
            {totals.ivaBreakdown.map((iva) => (
              <div key={iva.rate} className="flex justify-between text-zinc-500">
                <span>IVA {iva.rate}%</span>
                <span>{fmt(iva.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 text-base font-semibold">
              <span>Total</span>
              <span>{fmt(totals.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

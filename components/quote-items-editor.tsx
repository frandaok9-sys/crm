"use client";

import { useMemo, useRef, useState } from "react";

import { computeQuoteTotals } from "@/lib/quotes-calc";

export type QuoteRow = {
  type: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string; // % por ítem
  ivaRate: string;
};

/** Units used in industrial flooring quotes (m² is the default). */
export const UNITS = ["m²", "un", "L", "kg", "ml", "h", "global"] as const;

type TaxRateOption = { rate: string; name: string };

/** Catalog product ready to be inserted as a quote line. */
export type CatalogProduct = {
  id: string;
  label: string; // "Ashford Formula x 208 L · Ashford"
  priceLabel: string; // "$ 850.000,00"
  unit: string;
  price: string;
  ivaRate: string;
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const cell =
  "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800";

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
  initialOverallDiscount,
  products,
}: {
  taxRates: TaxRateOption[];
  defaultRate: string;
  currencySymbol: string;
  initial?: QuoteRow[];
  initialOverallDiscount?: string;
  products?: CatalogProduct[];
}) {
  const [overallDiscount, setOverallDiscount] = useState<string>(
    initialOverallDiscount && Number(initialOverallDiscount) > 0
      ? String(Number(initialOverallDiscount))
      : ""
  );
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
            discount: "0",
            ivaRate: defaultRate,
          },
        ]
  );
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const catalogBlur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const catalogMatches = useMemo(() => {
    if (!products || !catalogQuery.trim()) return [];
    const q = normalize(catalogQuery.trim());
    return products.filter((p) => normalize(p.label).includes(q)).slice(0, 8);
  }, [products, catalogQuery]);

  function addFromCatalog(product: CatalogProduct) {
    setRows((prev) => {
      // Replace a single untouched empty row instead of appending after it.
      const isBlank =
        prev.length === 1 &&
        !prev[0].description &&
        prev[0].unitPrice === "0";
      const newRow: QuoteRow = {
        type: "PRODUCT",
        description: product.label,
        quantity: "1",
        unit: product.unit,
        unitPrice: product.price,
        discount: "0",
        ivaRate: product.ivaRate,
      };
      return isBlank ? [newRow] : [...prev, newRow];
    });
    setCatalogQuery("");
    setCatalogOpen(false);
  }

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
        discount: "0",
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
          discount: sanitize(r.discount || "0"),
          ivaRate: sanitize(r.ivaRate || "0"),
        })),
        sanitize(overallDiscount || "0")
      );
    } catch {
      return null;
    }
  }, [rows, overallDiscount]);

  const fmt = (v: string) =>
    `${currencySymbol} ${Number(v).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div>
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      <input type="hidden" name="overallDiscount" value={overallDiscount || "0"} />

      {products && products.length > 0 && (
        <div className="relative mb-3">
          <input
            type="text"
            value={catalogQuery}
            onChange={(e) => {
              setCatalogQuery(e.target.value);
              setCatalogOpen(true);
            }}
            onFocus={() => setCatalogOpen(true)}
            onBlur={() => {
              catalogBlur.current = setTimeout(
                () => setCatalogOpen(false),
                150
              );
            }}
            placeholder="🔍 Buscar en el catálogo (Sinteplast, Ashford…) para agregar un ítem"
            className={`${cell} w-full`}
          />
          {catalogOpen && catalogMatches.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
              {catalogMatches.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addFromCatalog(product);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    <span>{product.label}</span>
                    <span className="whitespace-nowrap text-xs text-zinc-500">
                      {product.priceLabel} / {product.unit}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {catalogOpen &&
            catalogQuery.trim() !== "" &&
            catalogMatches.length === 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-500 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                Sin resultados en el catálogo
              </div>
            )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500">
              <th className="px-1 py-2 font-medium">Tipo</th>
              <th className="w-full px-1 py-2 font-medium">Descripción</th>
              <th className="px-1 py-2 font-medium">Cant.</th>
              <th className="px-1 py-2 font-medium">Unidad</th>
              <th className="px-1 py-2 font-medium">P. unitario</th>
              <th className="px-1 py-2 font-medium">Desc. %</th>
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
                <td className="w-full px-1 py-1">
                  <input
                    value={row.description}
                    onChange={(e) =>
                      update(index, { description: e.target.value })
                    }
                    placeholder="Detalle"
                    title={row.description}
                    className={`${cell} w-full min-w-72`}
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
                    {!(UNITS as readonly string[]).includes(row.unit) && (
                      <option value={row.unit}>{row.unit}</option>
                    )}
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
                    className={`${cell} w-28`}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={row.discount}
                    inputMode="decimal"
                    onChange={(e) => update(index, { discount: e.target.value })}
                    className={`${cell} w-16 text-right`}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={row.ivaRate}
                    onChange={(e) => update(index, { ivaRate: e.target.value })}
                    className={cell}
                  >
                    {!taxRates.some((t) => t.rate === row.ivaRate) && (
                      <option value={row.ivaRate}>{row.ivaRate}%</option>
                    )}
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
        className="mt-2 text-sm font-medium text-primary hover:underline"
      >
        + Agregar ítem
      </button>

      {totals && (
        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Subtotal</span>
              <span>{fmt(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-zinc-500">
                Descuento general
                <input
                  value={overallDiscount}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => setOverallDiscount(e.target.value)}
                  className={`${cell} w-14 text-right`}
                />
                %
              </span>
              <span className={Number(totals.overallDiscountAmount) > 0 ? "text-red-600" : "text-zinc-400"}>
                {Number(totals.overallDiscountAmount) > 0 ? "−" : ""}
                {fmt(totals.overallDiscountAmount)}
              </span>
            </div>
            {Number(totals.overallDiscountAmount) > 0 && (
              <div className="flex justify-between font-medium">
                <span className="text-zinc-500">Neto</span>
                <span>{fmt(totals.net)}</span>
              </div>
            )}
            {totals.ivaBreakdown.map((iva) => (
              <div key={iva.rate} className="flex justify-between text-zinc-500">
                <span>IVA {Number(iva.rate)}%</span>
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

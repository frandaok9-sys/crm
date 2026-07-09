import { requireActiveUser } from "@/lib/auth";
import { canViewAllRecords } from "@/lib/permissions";
import { getMetrics, type CurrencySeries } from "@/lib/metrics";
import { formatMoney } from "@/lib/opportunities";
import { Currency } from "@/lib/generated/prisma/enums";

// Paleta de series validada (scripts/validate_palette.js · modo oscuro · 4/4):
// rojo RC = Aprobado · azul acero = Cotizado. CVD ΔE 78.5.
const APPROVED_COLOR = "#e0503a";
const QUOTED_COLOR = "#5b82d6";

function compact(value: string, currency: string): string {
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value))}`;
}

function toCurrency(code: string): Currency {
  return code === "USD" ? Currency.USD : Currency.ARS;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-l-4 border-primary bg-card p-4 shadow-sm">
      <div className="font-heading text-2xl font-semibold tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-4 text-xs text-zinc-400">
      <span className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: QUOTED_COLOR }}
        />
        Cotizado
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: APPROVED_COLOR }}
        />
        Aprobado
      </span>
    </div>
  );
}

/** Barras mensuales agrupadas (2 series) con tooltip al pasar y vista tabla. */
function MonthlyChart({ series }: { series: CurrencySeries }) {
  const max = Number(series.maxValue) || 1;
  const currency = toCurrency(series.currency);

  return (
    <section className="rounded-xl border bg-white p-5 dark:bg-zinc-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-500">
          Presupuestos por mes · {series.currency}
        </h2>
        <Legend />
      </div>

      <div className="flex h-44 items-end gap-3 border-b border-zinc-200 pb-px dark:border-zinc-700">
        {series.months.map((m) => {
          const qh = Math.round((Number(m.quoted) / max) * 100);
          const ah = Math.round((Number(m.approved) / max) * 100);
          return (
            <div
              key={m.label}
              className="group relative flex h-full flex-1 items-end justify-center gap-[2px]"
            >
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border bg-white px-3 py-2 text-xs shadow-lg group-hover:block dark:border-zinc-700 dark:bg-zinc-800">
                <div className="font-medium">{m.label}</div>
                <div className="text-zinc-500">
                  Cotizado: {formatMoney(m.quoted, currency)}
                </div>
                <div className="text-zinc-500">
                  Aprobado: {formatMoney(m.approved, currency)}
                </div>
              </div>
              <div
                className="w-5 rounded-t-[4px]"
                style={{
                  background: QUOTED_COLOR,
                  height: `${qh}%`,
                  minHeight: Number(m.quoted) > 0 ? 3 : 0,
                }}
              />
              <div
                className="w-5 rounded-t-[4px]"
                style={{
                  background: APPROVED_COLOR,
                  height: `${ah}%`,
                  minHeight: Number(m.approved) > 0 ? 3 : 0,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-3">
        {series.months.map((m) => (
          <div
            key={m.label}
            className="flex-1 text-center text-[11px] text-zinc-500"
          >
            {m.label}
          </div>
        ))}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          Ver tabla
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1 font-medium">Mes</th>
              <th className="py-1 text-right font-medium">Cotizado</th>
              <th className="py-1 text-right font-medium">Aprobado</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {series.months.map((m) => (
              <tr key={m.label} className="border-t border-zinc-200 dark:border-zinc-800/40">
                <td className="py-1">{m.label}</td>
                <td className="py-1 text-right">
                  {formatMoney(m.quoted, currency)}
                </td>
                <td className="py-1 text-right">
                  {formatMoney(m.approved, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

export default async function MetricsPage() {
  const user = await requireActiveUser();
  const companyWide = canViewAllRecords(user);
  const data = await getMetrics(user);

  const hasQuotes = data.totals.length > 0;
  const arsTotals = data.totals.find((t) => t.currency === "ARS");
  const usdTotals = data.totals.find((t) => t.currency === "USD");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Métricas</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {companyWide
            ? "Visión general de toda la empresa."
            : "Tu actividad comercial."}
        </p>
      </div>

      {/* Indicadores principales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {arsTotals && (
          <Tile
            label="Aprobado ARS"
            value={formatMoney(arsTotals.approved, Currency.ARS) ?? "—"}
          />
        )}
        {usdTotals && (
          <Tile
            label="Aprobado USD"
            value={formatMoney(usdTotals.approved, Currency.USD) ?? "—"}
          />
        )}
        <Tile
          label="Conversión"
          value={`${data.conversion.ratePct}%`}
        />
        <Tile label="m² en pipeline" value={`${Number(data.pipelineM2).toLocaleString("es-AR")} m²`} />
      </div>
      <p className="-mt-5 text-xs text-zinc-500">
        Conversión: {data.conversion.approved} aprobado(s) sobre{" "}
        {data.conversion.issued} presupuesto(s) emitido(s).
      </p>

      {!hasQuotes ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-zinc-500 dark:bg-zinc-900">
          Todavía no hay presupuestos para graficar.
        </div>
      ) : (
        <>
          {/* Serie mensual por moneda */}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.monthly.map((series) => (
              <MonthlyChart key={series.currency} series={series} />
            ))}
          </div>

          {/* Aprobado por segmento */}
          {data.bySegment.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.bySegment.map(({ currency, rows }) => {
                const max = Number(rows[0]?.total) || 1;
                const cur = toCurrency(currency);
                return (
                  <section
                    key={currency}
                    className="rounded-xl border bg-white p-5 dark:bg-zinc-900"
                  >
                    <h2 className="mb-4 text-sm font-medium text-zinc-500">
                      Aprobado por segmento · {currency}
                    </h2>
                    <div className="space-y-3">
                      {rows.map((row) => (
                        <div key={row.label}>
                          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                            <span>{row.label}</span>
                            <span
                              className="tabular-nums text-zinc-400"
                              title={formatMoney(row.total, cur) ?? ""}
                            >
                              {compact(row.total, currency)}
                            </span>
                          </div>
                          <div className="h-3 rounded-r-[4px] bg-zinc-100 dark:bg-zinc-800">
                            <div
                              className="h-3 rounded-r-[4px]"
                              style={{
                                background: APPROVED_COLOR,
                                width: `${Math.max((Number(row.total) / max) * 100, 2)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Comparativa por vendedor — solo visión general (Admin/Gerencia) */}
      {data.bySeller && data.bySeller.length > 0 && (
        <section className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-900">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-medium text-zinc-500">
              Por vendedor
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-5 py-3 font-medium">Vendedor</th>
                <th className="px-5 py-3 text-right font-medium">Cotizado</th>
                <th className="px-5 py-3 text-right font-medium">Aprobado</th>
                <th className="px-5 py-3 text-right font-medium">Conversión</th>
                <th className="px-5 py-3 text-right font-medium">
                  m² en pipeline
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.bySeller.map((seller) => (
                <tr key={seller.name} className="border-b last:border-0">
                  <td className="px-5 py-3 font-medium">{seller.name}</td>
                  <td className="px-5 py-3 text-right">
                    {seller.quoted.length === 0
                      ? "—"
                      : seller.quoted.map((q) => (
                          <div key={q.currency}>
                            {formatMoney(q.total, toCurrency(q.currency))}
                          </div>
                        ))}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">
                    {seller.approved.length === 0
                      ? "—"
                      : seller.approved.map((a) => (
                          <div key={a.currency}>
                            {formatMoney(a.total, toCurrency(a.currency))}
                          </div>
                        ))}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {seller.issued > 0 ? (
                      <>
                        {seller.ratePct}%{" "}
                        <span className="text-xs text-zinc-500">
                          ({seller.approvedCount}/{seller.issued})
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {Number(seller.pipelineM2) > 0
                      ? `${Number(seller.pipelineM2).toLocaleString("es-AR")} m²`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Embudo del pipeline */}
      {data.funnel.length > 0 && (
        <section className="rounded-xl border bg-white p-5 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-500">
            Embudo del pipeline
          </h2>
          <div className="space-y-3">
            {data.funnel.map((row) => {
              const maxCount = Math.max(...data.funnel.map((f) => f.count), 1);
              return (
                <div key={row.stage}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span>
                      {row.stage}{" "}
                      <span className="text-zinc-500">· {row.count}</span>
                    </span>
                    <span className="text-xs tabular-nums text-zinc-400">
                      {row.amounts
                        .map((a) => compact(a.total, a.currency))
                        .join(" · ")}
                      {Number(row.m2) > 0 &&
                        ` · ${Number(row.m2).toLocaleString("es-AR")} m²`}
                    </span>
                  </div>
                  <div className="h-3 rounded-r-[4px] bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-3 rounded-r-[4px]"
                      style={{
                        background: QUOTED_COLOR,
                        width: `${Math.max((row.count / maxCount) * 100, 2)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

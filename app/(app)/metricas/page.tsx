import { requireActiveUser } from "@/lib/auth";
import { canViewAllRecords } from "@/lib/permissions";
import { getMetrics, type CurrencySeries } from "@/lib/metrics";
import { formatMoney } from "@/lib/opportunities";
import { stageHex } from "@/lib/stage-colors";
import { Currency } from "@/lib/generated/prisma/enums";
import { KpiCard } from "@/components/kpi-card";
import { InitialsAvatar, sellerColor } from "@/components/initials-avatar";

// Paleta de series validada (dataviz · modo oscuro · 4/4 checks)
const APPROVED_COLOR = "#E0503A";
const QUOTED_COLOR = "#5B82D6";

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
      {children}
    </h2>
  );
}

function Legend() {
  return (
    <div className="flex gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-[2px]"
          style={{ background: QUOTED_COLOR }}
        />
        Cotizado
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-[2px]"
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
    <section className="rounded-[12px] border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Presupuestos por mes · {series.currency}</SectionTitle>
        <Legend />
      </div>

      <div className="flex h-44 items-end gap-3 border-b border-border pb-px">
        {series.months.map((m) => {
          const qh = Math.round((Number(m.quoted) / max) * 100);
          const ah = Math.round((Number(m.approved) / max) * 100);
          return (
            <div
              key={m.label}
              className="group relative flex h-full flex-1 items-end justify-center gap-[2px]"
            >
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[8px] border bg-popover px-3 py-2 text-xs shadow-[var(--shadow-panel)] group-hover:block">
                <div className="font-semibold">{m.label}</div>
                <div className="text-muted-foreground">
                  Cotizado: {formatMoney(m.quoted, currency)}
                </div>
                <div className="text-muted-foreground">
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
            className="flex-1 text-center text-[11.5px] text-muted2"
          >
            {m.label}
          </div>
        ))}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted2 transition-colors hover:text-text2">
          Ver tabla
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Mes</th>
              <th className="py-1 text-right font-medium">Cotizado</th>
              <th className="py-1 text-right font-medium">Aprobado</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {series.months.map((m) => (
              <tr key={m.label} className="border-t border-border2">
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

const SELLER_GRID =
  "grid grid-cols-[1.8fr_1.2fr_1.2fr_1fr_1fr] items-center";

export default async function MetricsPage() {
  const user = await requireActiveUser();
  const companyWide = canViewAllRecords(user);
  const data = await getMetrics(user);

  const hasQuotes = data.totals.length > 0;
  const arsTotals = data.totals.find((t) => t.currency === "ARS");
  const usdTotals = data.totals.find((t) => t.currency === "USD");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Métricas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {companyWide
              ? "Visión general de toda la empresa."
              : "Tu actividad comercial."}
          </p>
        </div>
        {hasQuotes && (
          <a
            href="/admin/export?type=metricas"
            className="flex items-center gap-2 rounded-[9px] border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-text1 transition-colors hover:border-primary/50 hover:bg-hoverbg"
          >
            <span className="text-primary">↓</span> Exportar a Excel
          </a>
        )}
      </div>

      <div>
        <div className="grid grid-cols-2 gap-[14px] lg:grid-cols-4">
          {arsTotals && (
            <KpiCard
              size="md"
              label="Aprobado ARS"
              value={formatMoney(arsTotals.approved, Currency.ARS) ?? "—"}
            />
          )}
          {usdTotals && (
            <KpiCard
              size="md"
              label="Aprobado USD"
              value={formatMoney(usdTotals.approved, Currency.USD) ?? "—"}
            />
          )}
          <KpiCard
            size="md"
            label="Conversión"
            value={`${data.conversion.ratePct}%`}
            note={`${data.conversion.approved} aprobado(s) de ${data.conversion.issued} emitido(s)`}
          />
          <KpiCard
            size="md"
            label="m² en pipeline"
            value={`${Number(data.pipelineM2).toLocaleString("es-AR")} m²`}
          />
        </div>
      </div>

      {!hasQuotes ? (
        <div className="rounded-[12px] border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          Todavía no hay presupuestos para graficar.
        </div>
      ) : (
        <>
          <div className="grid gap-[14px] lg:grid-cols-2">
            {data.monthly.map((series) => (
              <MonthlyChart key={series.currency} series={series} />
            ))}
          </div>

          {data.bySegment.length > 0 && (
            <div className="grid gap-[14px] lg:grid-cols-2">
              {data.bySegment.map(({ currency, rows }) => {
                const max = Number(rows[0]?.total) || 1;
                const cur = toCurrency(currency);
                return (
                  <section
                    key={currency}
                    className="rounded-[12px] border bg-card p-5"
                  >
                    <div className="mb-4">
                      <SectionTitle>
                        Aprobado por segmento · {currency}
                      </SectionTitle>
                    </div>
                    <div className="space-y-3">
                      {rows.map((row) => (
                        <div key={row.label}>
                          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="text-text2">{row.label}</span>
                            <span
                              className="tabular-nums text-muted-foreground"
                              title={formatMoney(row.total, cur) ?? ""}
                            >
                              {compact(row.total, currency)}
                            </span>
                          </div>
                          <div className="h-2 rounded-[4px] bg-chip">
                            <div
                              className="h-2 rounded-[4px]"
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

      {/* Por vendedor — solo visión general */}
      {data.bySeller && data.bySeller.length > 0 && (
        <section className="overflow-hidden rounded-[12px] border bg-card">
          <div className="border-b border-border2 px-5 py-4">
            <SectionTitle>Por vendedor</SectionTitle>
          </div>
          <div
            className={`${SELLER_GRID} border-b border-border2 bg-card2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground`}
          >
            <span>Vendedor</span>
            <span className="text-right">Cotizado</span>
            <span className="text-right">Aprobado</span>
            <span className="text-right">Conversión</span>
            <span className="text-right">m² pipeline</span>
          </div>
          {data.bySeller.map((seller) => (
            <div
              key={seller.name}
              className={`${SELLER_GRID} border-b border-border2 px-5 py-[13px] text-[13px] last:border-0 hover:bg-hoverbg`}
            >
              <span className="flex min-w-0 items-center gap-2 pr-3">
                <InitialsAvatar
                  name={seller.name}
                  size={22}
                  tint={sellerColor(seller.name)}
                />
                <span className="truncate font-semibold">{seller.name}</span>
              </span>
              <span className="text-right tabular-nums text-text2">
                {seller.quoted.length === 0
                  ? "—"
                  : seller.quoted.map((q) => (
                      <span key={q.currency} className="block">
                        {formatMoney(q.total, toCurrency(q.currency))}
                      </span>
                    ))}
              </span>
              <span className="text-right font-bold tabular-nums">
                {seller.approved.length === 0
                  ? "—"
                  : seller.approved.map((a) => (
                      <span key={a.currency} className="block">
                        {formatMoney(a.total, toCurrency(a.currency))}
                      </span>
                    ))}
              </span>
              <span className="text-right tabular-nums text-text2">
                {seller.issued > 0 ? (
                  <>
                    {seller.ratePct}%{" "}
                    <span className="text-[11px] text-muted-foreground">
                      ({seller.approvedCount}/{seller.issued})
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </span>
              <span className="text-right tabular-nums text-text2">
                {Number(seller.pipelineM2) > 0
                  ? `${Number(seller.pipelineM2).toLocaleString("es-AR")} m²`
                  : "—"}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* Embudo del pipeline */}
      {data.funnel.length > 0 && (
        <section className="rounded-[12px] border bg-card p-5">
          <div className="mb-4">
            <SectionTitle>Embudo del pipeline</SectionTitle>
          </div>
          <div className="space-y-3">
            {data.funnel.map((row) => {
              const maxCount = Math.max(...data.funnel.map((f) => f.count), 1);
              const hex = stageHex(row.color);
              return (
                <div key={row.stage}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                    <span className="flex items-center gap-2 text-text2">
                      <span
                        className="h-[6px] w-[6px] rounded-[2px]"
                        style={{ background: hex }}
                      />
                      {row.stage}{" "}
                      <span className="text-muted-foreground">
                        · {row.count}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-muted2">
                      {row.amounts
                        .map((a) => compact(a.total, a.currency))
                        .join(" · ")}
                      {Number(row.m2) > 0 &&
                        ` · ${Number(row.m2).toLocaleString("es-AR")} m²`}
                    </span>
                  </div>
                  <div className="h-2 rounded-[4px] bg-chip">
                    <div
                      className="h-2 rounded-[4px]"
                      style={{
                        background: hex,
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

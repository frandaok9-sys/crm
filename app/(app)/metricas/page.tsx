import { requireActiveUser } from "@/lib/auth";
import { canViewAllRecords } from "@/lib/permissions";
import { getMetrics } from "@/lib/metrics";
import { formatMoney } from "@/lib/opportunities";
import { Currency } from "@/lib/generated/prisma/enums";
import { KpiCard } from "@/components/kpi-card";
import { InitialsAvatar, sellerColor } from "@/components/initials-avatar";
import { MetricsBoard } from "@/components/metrics-board";

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
            <span className="text-primary">↓</span> Exportar PDF
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

      {!hasQuotes && data.funnel.length === 0 ? (
        <div className="rounded-[12px] border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          Todavía no hay datos para graficar.
        </div>
      ) : (
        <MetricsBoard
          monthly={data.monthly}
          bySegment={data.bySegment}
          funnel={data.funnel}
        />
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

    </div>
  );
}

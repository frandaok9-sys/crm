import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canViewAllRecords } from "@/lib/permissions";
import { getMetrics } from "@/lib/metrics";
import { formatMoney } from "@/lib/opportunities";
import { Currency, UserStatus } from "@/lib/generated/prisma/enums";
import { TrendCard } from "@/components/trend-card";
import { InitialsAvatar, sellerColor } from "@/components/initials-avatar";
import { MetricsBoard } from "@/components/metrics-board";
import { SellerFilter } from "@/components/seller-filter";

function toCurrency(code: string): Currency {
  return code === "USD" ? Currency.USD : Currency.ARS;
}

/** Serie mensual de "aprobado" (números) para el mini-gráfico de una moneda. */
function approvedSeries(
  monthly: { currency: string; months: { approved: string }[] }[],
  currency: string
): number[] | undefined {
  const s = monthly.find((m) => m.currency === currency);
  return s ? s.months.map((m) => Number(m.approved)) : undefined;
}

/** Texto de tendencia (▲/▼ %) del primer al último mes de una serie. */
function pctTrend(series?: number[]): string | undefined {
  if (!series || series.length < 2) return undefined;
  const first = series[0];
  const last = series[series.length - 1];
  if (first === 0 && last === 0) return undefined;
  if (first === 0) return "▲ nuevo";
  const pct = Math.round(((last - first) / first) * 100);
  if (pct === 0) return undefined;
  return `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`;
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

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const user = await requireActiveUser();
  const companyWide = canViewAllRecords(user);

  // Filtro por usuario (solo admin/gerente): mide a una persona en particular
  // — incluidos ellos mismos — con ?v=<id>. Validado contra usuarios activos.
  const users = companyWide
    ? await prisma.user.findMany({
        where: { status: UserStatus.ACTIVE },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];
  const filter =
    companyWide && v && users.some((u) => u.id === v) ? v : null;
  const filteredUser = filter ? users.find((u) => u.id === filter) : null;

  const data = await getMetrics(user, filter);

  const hasQuotes = data.totals.length > 0;
  const arsTotals = data.totals.find((t) => t.currency === "ARS");
  const usdTotals = data.totals.find((t) => t.currency === "USD");
  const arsSeries = approvedSeries(data.monthly, "ARS");
  const usdSeries = approvedSeries(data.monthly, "USD");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Métricas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filteredUser
              ? `Actividad de ${filteredUser.name ?? filteredUser.email}.`
              : companyWide
              ? "Visión general de toda la empresa."
              : "Tu actividad comercial."}
          </p>
        </div>
        {companyWide && users.length > 0 && (
          <SellerFilter
            basePath="/metricas"
            label="Usuario"
            sellers={users.map((u) => ({
              id: u.id,
              label: u.name ?? u.email,
            }))}
            current={filter}
          />
        )}
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
            <TrendCard
              label="Aprobado ARS"
              value={formatMoney(arsTotals.approved, Currency.ARS) ?? "—"}
              series={arsSeries}
              trendText={pctTrend(arsSeries)}
              note="últimos 6 meses"
            />
          )}
          {usdTotals && (
            <TrendCard
              label="Aprobado USD"
              value={formatMoney(usdTotals.approved, Currency.USD) ?? "—"}
              series={usdSeries}
              trendText={pctTrend(usdSeries)}
              note="últimos 6 meses"
            />
          )}
          <TrendCard
            label="Conversión"
            value={`${data.conversion.ratePct}%`}
            note={`${data.conversion.approved} aprobado(s) de ${data.conversion.issued} emitido(s)`}
          />
          <TrendCard
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

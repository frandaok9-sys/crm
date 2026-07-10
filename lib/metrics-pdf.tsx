import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { MetricsData } from "@/lib/metrics";
import { stageHex } from "@/lib/stage-colors";

/**
 * PDF de métricas VISUALES (gráficos dibujados con react-pdf): KPIs, barras
 * mensuales cotizado/aprobado por moneda, aprobado por segmento, embudo por
 * etapa y comparativa por vendedor. Identidad RC (grafito + rojo) para impresión.
 */

const RED = "#d6301c";
const STEEL = "#5c5e66";
const GRAPHITE = "#1a1b1f";
const LINE = "#e2e2e6";
const BG_SOFT = "#f4f4f5";
const BLUE = "#4f74c4";

export type MetricsPdfData = {
  metrics: MetricsData;
  companyName: string;
  logo: string | null;
  scopeLabel: string;
  generatedAt: string; // dd/mm/aaaa
};

function money(value: string, currency: string): string {
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${Number(value).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: GRAPHITE,
    paddingTop: 34,
    paddingBottom: 50,
    paddingHorizontal: 40,
  },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: RED },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  logo: { height: 38, objectFit: "contain" },
  brandFallback: { fontFamily: "Helvetica-Bold", fontSize: 18, letterSpacing: 1 },
  companyBlock: { alignItems: "flex-end" },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  companyLine: { color: STEEL, fontSize: 8, marginTop: 1.5, textAlign: "right" },

  titleRow: {
    borderBottomWidth: 2,
    borderBottomColor: GRAPHITE,
    paddingBottom: 8,
    marginBottom: 14,
  },
  title: { fontFamily: "Helvetica-Bold", fontSize: 20, letterSpacing: 2, textTransform: "uppercase" },
  subtitle: { color: STEEL, fontSize: 8.5, marginTop: 3 },

  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: STEEL,
    marginBottom: 8,
    marginTop: 4,
  },

  // KPI
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  kpiCard: {
    flex: 1,
    backgroundColor: BG_SOFT,
    borderLeftWidth: 3,
    borderLeftColor: RED,
    borderRadius: 4,
    padding: 9,
  },
  kpiLabel: { fontSize: 6.5, letterSpacing: 1, textTransform: "uppercase", color: STEEL },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 4 },

  card: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },

  legendRow: { flexDirection: "row", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendDot: { width: 6, height: 6, borderRadius: 1 },
  legendText: { fontSize: 7, color: STEEL },

  // Barra horizontal
  hRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  hLabel: { width: 120, fontSize: 8, color: GRAPHITE },
  hTrack: { flex: 1, height: 9, backgroundColor: BG_SOFT, borderRadius: 2 },
  hFill: { height: 9, borderRadius: 2 },
  hValue: { width: 80, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold" },

  // Tabla vendedores
  th: { flexDirection: "row", backgroundColor: GRAPHITE, borderRadius: 3, paddingVertical: 5, paddingHorizontal: 6 },
  thText: { color: "#fff", fontSize: 6.5, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5, paddingHorizontal: 6 },
  cName: { flex: 2.2 },
  cNum: { flex: 1.6, textAlign: "right" },
  cSmall: { flex: 1, textAlign: "right" },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 7,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: STEEL },
  empty: { color: STEEL, fontSize: 8.5, fontStyle: "italic" },
});

const CHART_H = 84;

/** Gráfico de barras verticales agrupadas (cotizado vs aprobado) por mes. */
function MonthlyChart({ series }: { series: MetricsData["monthly"][number] }) {
  const max = Number(series.maxValue) || 1;
  const barH = (v: string) => Math.max((Number(v) / max) * CHART_H, Number(v) > 0 ? 1.5 : 0);
  const symbol = series.currency === "USD" ? "US$" : "$";

  return (
    <View style={styles.card} wrap={false}>
      <View style={styles.cardHead}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>
          Cotizado vs aprobado · {series.currency}
        </Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BLUE }]} />
            <Text style={styles.legendText}>Cotizado</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: RED }]} />
            <Text style={styles.legendText}>Aprobado</Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", height: CHART_H, alignItems: "flex-end", gap: 6 }}>
        {series.months.map((m, i) => (
          <View
            key={i}
            style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 3 }}
          >
            <View style={{ width: 9, height: barH(m.quoted), backgroundColor: BLUE, borderRadius: 1 }} />
            <View style={{ width: 9, height: barH(m.approved), backgroundColor: RED, borderRadius: 1 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
        {series.months.map((m, i) => (
          <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 6.5, color: STEEL }}>
            {m.label}
          </Text>
        ))}
      </View>
      <Text style={{ fontSize: 6.5, color: STEEL, marginTop: 4, textAlign: "right" }}>
        Máximo del período: {symbol} {Number(series.maxValue).toLocaleString("es-AR")}
      </Text>
    </View>
  );
}

function HBar({
  label,
  value,
  max,
  color,
  valueText,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  valueText: string;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <View style={styles.hRow}>
      <Text style={styles.hLabel}>{label}</Text>
      <View style={styles.hTrack}>
        <View style={[styles.hFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.hValue}>{valueText}</Text>
    </View>
  );
}

function MetricsPdf({ data }: { data: MetricsPdfData }) {
  const m = data.metrics;
  const ars = m.totals.find((t) => t.currency === "ARS");
  const usd = m.totals.find((t) => t.currency === "USD");
  const maxFunnel = Math.max(...m.funnel.map((f) => f.count), 1);

  return (
    <Document title="Reporte de métricas" author={data.companyName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar} fixed />

        <View style={styles.headerRow}>
          {data.logo ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.logo} style={styles.logo} />
          ) : (
            <Text style={styles.brandFallback}>
              <Text style={{ color: RED }}>RC</Text> PISOS INDUSTRIALES
            </Text>
          )}
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{data.companyName}</Text>
            <Text style={styles.companyLine}>Generado el {data.generatedAt}</Text>
          </View>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>
            Reporte de <Text style={{ color: RED }}>métricas</Text>
          </Text>
          <Text style={styles.subtitle}>{data.scopeLabel}</Text>
        </View>

        {/* KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Aprobado ARS</Text>
            <Text style={styles.kpiValue}>{ars ? money(ars.approved, "ARS") : "$ 0"}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Aprobado USD</Text>
            <Text style={styles.kpiValue}>{usd ? money(usd.approved, "USD") : "US$ 0"}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Conversión</Text>
            <Text style={styles.kpiValue}>{m.conversion.ratePct}%</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>m² en pipeline</Text>
            <Text style={styles.kpiValue}>
              {Number(m.pipelineM2).toLocaleString("es-AR")}
            </Text>
          </View>
        </View>

        {/* Barras mensuales por moneda */}
        <Text style={styles.sectionTitle}>Evolución mensual</Text>
        {m.monthly.length === 0 ? (
          <Text style={styles.empty}>Sin presupuestos en el período.</Text>
        ) : (
          m.monthly.map((s) => <MonthlyChart key={s.currency} series={s} />)
        )}

        {/* Embudo por etapa */}
        <Text style={styles.sectionTitle} break={m.monthly.length > 1}>
          Embudo del pipeline
        </Text>
        <View style={styles.card} wrap={false}>
          {m.funnel.length === 0 ? (
            <Text style={styles.empty}>Sin oportunidades cargadas.</Text>
          ) : (
            m.funnel.map((f) => (
              <HBar
                key={f.stage}
                label={f.stage}
                value={f.count}
                max={maxFunnel}
                color={stageHex(f.color)}
                valueText={`${f.count} opor.${
                  Number(f.m2) > 0 ? ` · ${Number(f.m2).toLocaleString("es-AR")} m²` : ""
                }`}
              />
            ))
          )}
        </View>

        {/* Aprobado por segmento */}
        {m.bySegment.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Aprobado por segmento</Text>
            {m.bySegment.map((group) => {
              const max = Math.max(...group.rows.map((r) => Number(r.total)), 1);
              return (
                <View style={styles.card} key={group.currency} wrap={false}>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 8 }}>
                    {group.currency}
                  </Text>
                  {group.rows.map((r) => (
                    <HBar
                      key={r.label}
                      label={r.label}
                      value={Number(r.total)}
                      max={max}
                      color={RED}
                      valueText={money(r.total, group.currency)}
                    />
                  ))}
                </View>
              );
            })}
          </>
        )}

        {/* Por vendedor */}
        {m.bySeller && m.bySeller.length > 0 && (
          <>
            <Text style={styles.sectionTitle} break>
              Por vendedor
            </Text>
            <View style={styles.th}>
              <Text style={[styles.thText, styles.cName]}>Vendedor</Text>
              <Text style={[styles.thText, styles.cNum]}>Aprob. ARS</Text>
              <Text style={[styles.thText, styles.cNum]}>Aprob. USD</Text>
              <Text style={[styles.thText, styles.cSmall]}>Conv.</Text>
              <Text style={[styles.thText, styles.cSmall]}>m²</Text>
            </View>
            {m.bySeller.map((s) => {
              const amt = (rows: { currency: string; total: string }[], c: string) =>
                rows.find((x) => x.currency === c)?.total ?? "0";
              return (
                <View style={styles.tr} key={s.name} wrap={false}>
                  <Text style={styles.cName}>{s.name}</Text>
                  <Text style={styles.cNum}>{money(amt(s.approved, "ARS"), "ARS")}</Text>
                  <Text style={styles.cNum}>{money(amt(s.approved, "USD"), "USD")}</Text>
                  <Text style={styles.cSmall}>{s.ratePct}%</Text>
                  <Text style={styles.cSmall}>{Number(s.pipelineM2).toLocaleString("es-AR")}</Text>
                </View>
              );
            })}
          </>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{data.companyName} · Reporte de métricas</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderMetricsPdf(data: MetricsPdfData): Promise<Buffer> {
  return renderToBuffer(<MetricsPdf data={data} />);
}

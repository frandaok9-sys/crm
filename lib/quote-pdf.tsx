import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

import { computeQuoteTotals } from "@/lib/quotes-calc";
import { QUOTE_STATUS_LABELS } from "@/lib/quotes";
import { ITEM_TYPE_LABELS } from "@/lib/quotes";
import type { QuoteStatus, QuoteItemType } from "@/lib/generated/prisma/enums";

/**
 * Quote PDF with the approved RC identity (graphite + red, industrial),
 * adapted for print on white paper. All money values arrive as fixed
 * 2-decimal strings — no floating point here.
 */

// Brand palette (print-adapted)
const RED = "#d6301c";
const GRAPHITE = "#1a1b1f";
const STEEL = "#5c5e66";
const LINE = "#e2e2e6";
const BG_SOFT = "#f4f4f5";

export type QuotePdfItem = {
  type: QuoteItemType;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  ivaRate: string;
  lineNet: string;
};

export type QuotePdfData = {
  code: string;
  version: number;
  status: QuoteStatus;
  currency: "ARS" | "USD";
  issueDate: string; // dd/mm/aaaa
  validUntil: string | null;
  notes: string | null;
  ownerName: string | null;
  client: {
    legalName: string;
    taxId: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
  };
  company: {
    name: string | null;
    taxId: string | null;
    address: string | null;
    cityLine: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    logo: string | null; // data URL
    footer: string | null;
    bankInfo: string | null;
  };
  items: QuotePdfItem[];
};

function money(value: string, currency: "ARS" | "USD"): string {
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${Number(value).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: GRAPHITE,
    paddingTop: 34,
    paddingBottom: 64,
    paddingHorizontal: 40,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: RED,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  logo: { height: 42, objectFit: "contain" },
  brandFallback: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    letterSpacing: 1,
  },
  companyBlock: { alignItems: "flex-end", maxWidth: 240 },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  companyLine: { color: STEEL, fontSize: 8, marginTop: 1.5, textAlign: "right" },

  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: GRAPHITE,
    paddingBottom: 8,
    marginBottom: 14,
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  titleCode: { color: RED },
  metaBlock: { alignItems: "flex-end" },
  metaLine: { fontSize: 9, color: STEEL, marginTop: 1.5 },
  metaStrong: { color: GRAPHITE, fontFamily: "Helvetica-Bold" },

  clientBox: {
    backgroundColor: BG_SOFT,
    borderLeftWidth: 3,
    borderLeftColor: RED,
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
  },
  label: {
    fontSize: 7,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: STEEL,
    marginBottom: 3,
  },
  clientName: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  clientLine: { color: STEEL, fontSize: 8.5, marginTop: 1.5 },

  // Items table
  th: {
    flexDirection: "row",
    backgroundColor: GRAPHITE,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  thText: {
    color: "#ffffff",
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  cDesc: { flex: 5 },
  cQty: { flex: 1.6, textAlign: "right" },
  cPrice: { flex: 2, textAlign: "right" },
  cIva: { flex: 1.2, textAlign: "right" },
  cNet: { flex: 2.2, textAlign: "right" },
  itemType: { color: STEEL, fontSize: 7, marginTop: 1.5 },

  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  totals: { width: 210 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
  },
  totalMuted: { color: STEEL },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 2,
    borderTopColor: RED,
    marginTop: 4,
    paddingTop: 6,
  },
  grandTotalText: { fontFamily: "Helvetica-Bold", fontSize: 12 },

  section: { marginTop: 16 },
  notesText: { color: STEEL, fontSize: 8.5, lineHeight: 1.5 },
  bankBox: {
    marginTop: 10,
    backgroundColor: BG_SOFT,
    borderRadius: 4,
    padding: 9,
  },

  footer: {
    position: "absolute",
    bottom: 26,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: STEEL },
});

function QuotePdf({ data }: { data: QuotePdfData }) {
  const totals = computeQuoteTotals(
    data.items.map((it) => ({
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      ivaRate: it.ivaRate,
    }))
  );
  const fmt = (v: string) => money(v, data.currency);
  const companyName = data.company.name ?? "RC Pisos Industriales";

  return (
    <Document
      title={`${data.code}${data.version > 1 ? ` Rev.${data.version}` : ""}`}
      author={companyName}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar} fixed />

        {/* Company header */}
        <View style={styles.headerRow}>
          {data.company.logo ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.company.logo} style={styles.logo} />
          ) : (
            <Text style={styles.brandFallback}>
              <Text style={{ color: RED }}>RC</Text> PISOS INDUSTRIALES
            </Text>
          )}
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{companyName}</Text>
            {data.company.taxId && (
              <Text style={styles.companyLine}>CUIT {data.company.taxId}</Text>
            )}
            {data.company.address && (
              <Text style={styles.companyLine}>{data.company.address}</Text>
            )}
            {data.company.cityLine && (
              <Text style={styles.companyLine}>{data.company.cityLine}</Text>
            )}
            {(data.company.phone || data.company.email) && (
              <Text style={styles.companyLine}>
                {[data.company.phone, data.company.email]
                  .filter(Boolean)
                  .join("  ·  ")}
              </Text>
            )}
            {data.company.website && (
              <Text style={styles.companyLine}>{data.company.website}</Text>
            )}
          </View>
        </View>

        {/* Title + meta */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            Presupuesto <Text style={styles.titleCode}>{data.code}</Text>
          </Text>
          <View style={styles.metaBlock}>
            {data.version > 1 && (
              <Text style={styles.metaLine}>
                Revisión <Text style={styles.metaStrong}>{data.version}</Text>
              </Text>
            )}
            <Text style={styles.metaLine}>
              Fecha <Text style={styles.metaStrong}>{data.issueDate}</Text>
            </Text>
            {data.validUntil && (
              <Text style={styles.metaLine}>
                Válido hasta{" "}
                <Text style={styles.metaStrong}>{data.validUntil}</Text>
              </Text>
            )}
            <Text style={styles.metaLine}>
              Estado{" "}
              <Text style={styles.metaStrong}>
                {QUOTE_STATUS_LABELS[data.status]}
              </Text>
            </Text>
            {data.ownerName && (
              <Text style={styles.metaLine}>
                Vendedor <Text style={styles.metaStrong}>{data.ownerName}</Text>
              </Text>
            )}
          </View>
        </View>

        {/* Client */}
        <View style={styles.clientBox}>
          <Text style={styles.label}>Cliente</Text>
          <Text style={styles.clientName}>{data.client.legalName}</Text>
          {data.client.taxId && (
            <Text style={styles.clientLine}>CUIT {data.client.taxId}</Text>
          )}
          {(data.client.address || data.client.city || data.client.province) && (
            <Text style={styles.clientLine}>
              {[data.client.address, data.client.city, data.client.province]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          )}
        </View>

        {/* Items */}
        <View style={styles.th}>
          <Text style={[styles.thText, styles.cDesc]}>Descripción</Text>
          <Text style={[styles.thText, styles.cQty]}>Cantidad</Text>
          <Text style={[styles.thText, styles.cPrice]}>P. Unitario</Text>
          <Text style={[styles.thText, styles.cIva]}>IVA</Text>
          <Text style={[styles.thText, styles.cNet]}>Neto</Text>
        </View>
        {data.items.map((item, index) => (
          <View style={styles.tr} key={index} wrap={false}>
            <View style={styles.cDesc}>
              <Text>{item.description}</Text>
              <Text style={styles.itemType}>
                {ITEM_TYPE_LABELS[item.type]}
              </Text>
            </View>
            <Text style={styles.cQty}>
              {Number(item.quantity).toLocaleString("es-AR")} {item.unit}
            </Text>
            <Text style={styles.cPrice}>{fmt(item.unitPrice)}</Text>
            <Text style={styles.cIva}>{Number(item.ivaRate)}%</Text>
            <Text style={styles.cNet}>{fmt(item.lineNet)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsWrap}>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalMuted}>Neto</Text>
              <Text>{fmt(totals.net)}</Text>
            </View>
            {totals.ivaBreakdown.map((iva) => (
              <View style={styles.totalRow} key={iva.rate}>
                <Text style={styles.totalMuted}>IVA {Number(iva.rate)}%</Text>
                <Text>{fmt(iva.amount)}</Text>
              </View>
            ))}
            <View style={styles.grandTotal}>
              <Text style={styles.grandTotalText}>TOTAL {data.currency}</Text>
              <Text style={styles.grandTotalText}>{fmt(totals.total)}</Text>
            </View>
          </View>
        </View>

        {/* Notes + bank info */}
        {data.notes && (
          <View style={styles.section}>
            <Text style={styles.label}>Condiciones</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        )}
        {data.company.bankInfo && (
          <View style={styles.bankBox}>
            <Text style={styles.label}>Datos de pago</Text>
            <Text style={styles.notesText}>{data.company.bankInfo}</Text>
          </View>
        )}
        {data.company.footer && !data.notes && (
          <View style={styles.section}>
            <Text style={styles.notesText}>{data.company.footer}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{companyName}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/** Renders the quote PDF and returns it as a Buffer. */
export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  return renderToBuffer(<QuotePdf data={data} />);
}

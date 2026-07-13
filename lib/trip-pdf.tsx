import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

/**
 * Hoja de ruta en PDF para el vendedor viajante: el recorrido con datos
 * comerciales de cada visita, para descargar/imprimir. Sin dependencias de IA:
 * todo llega ya calculado.
 */

const RED = "#d6301c";
const GRAPHITE = "#1a1b1f";
const STEEL = "#5c5e66";
const LINE = "#e2e2e6";
const BG_SOFT = "#f4f4f5";

export type TripPdfStop = {
  order: number;
  name: string;
  title: string | null;
  stageName: string | null;
  m2Label: string | null;
  amountLabel: string | null;
  address: string | null;
  contactName: string | null;
  phone: string | null;
  notes: string | null;
  legKm: string;
};

export type TripPdfData = {
  title: string;
  date: string;
  origin: string;
  returnLabel: string;
  fechaSalida: string | null;
  fechaLlegada: string | null;
  totalKm: string;
  totalTime: string;
  fuelCost: string;
  stops: TripPdfStop[];
  narrative: string | null;
};

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 40, paddingHorizontal: 36, fontSize: 10, color: GRAPHITE, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: RED, paddingBottom: 8, marginBottom: 12 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", color: GRAPHITE },
  sub: { fontSize: 9, color: STEEL, marginTop: 2 },
  date: { fontSize: 9, color: STEEL },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 14 },
  kpi: { flex: 1, backgroundColor: BG_SOFT, borderRadius: 6, padding: 8 },
  kpiVal: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  kpiLbl: { fontSize: 7, color: STEEL, textTransform: "uppercase", marginTop: 2, letterSpacing: 0.5 },
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: STEEL, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  narrative: { backgroundColor: BG_SOFT, borderRadius: 6, padding: 10, marginBottom: 14 },
  narrLine: { fontSize: 9, color: GRAPHITE, marginBottom: 2, lineHeight: 1.4 },
  stop: { flexDirection: "row", gap: 8, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 9, marginBottom: 7 },
  badge: { width: 20, height: 20, borderRadius: 10, backgroundColor: RED, color: "#fff", fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 4 },
  stopName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  stopMeta: { fontSize: 9, color: STEEL, marginTop: 1 },
  chip: { fontSize: 8, color: STEEL, backgroundColor: BG_SOFT, borderRadius: 3, paddingVertical: 1, paddingHorizontal: 4 },
  line: { fontSize: 9, color: GRAPHITE, marginTop: 2 },
  km: { fontSize: 9, fontFamily: "Helvetica-Bold", color: STEEL, textAlign: "right" },
  foot: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7.5, color: STEEL, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
});

function TripDoc({ data }: { data: TripPdfData }) {
  return (
    <Document title={data.title}>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.h1}>Hoja de ruta</Text>
            <Text style={s.sub}>
              Salida: {data.origin} · {data.returnLabel}
            </Text>
            {data.fechaSalida || data.fechaLlegada ? (
              <Text style={s.sub}>
                {data.fechaSalida ? `Salida ${data.fechaSalida}` : ""}
                {data.fechaSalida && data.fechaLlegada ? "   ·   " : ""}
                {data.fechaLlegada ? `Llegada ${data.fechaLlegada}` : ""}
              </Text>
            ) : null}
          </View>
          <Text style={s.date}>{data.date}</Text>
        </View>

        <View style={s.kpis}>
          {[
            { l: "Visitas", v: String(data.stops.length) },
            { l: "Distancia", v: data.totalKm },
            { l: "Tiempo", v: data.totalTime },
            { l: "Combustible", v: data.fuelCost },
          ].map((k) => (
            <View key={k.l} style={s.kpi}>
              <Text style={s.kpiVal}>{k.v}</Text>
              <Text style={s.kpiLbl}>{k.l}</Text>
            </View>
          ))}
        </View>

        {data.narrative ? (
          <View style={s.narrative}>
            {data.narrative
              .split("\n")
              .filter((l) => l.trim())
              .map((l, i) => (
                <Text key={i} style={s.narrLine}>
                  {l}
                </Text>
              ))}
          </View>
        ) : null}

        <Text style={s.sectionTitle}>Recorrido y visitas</Text>
        {data.stops.map((st) => (
          <View key={st.order} style={s.stop} wrap={false}>
            <Text style={s.badge}>{st.order}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.stopName}>{st.name}</Text>
              {st.title ? <Text style={s.stopMeta}>{st.title}</Text> : null}
              <View style={{ flexDirection: "row", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                {st.stageName ? <Text style={s.chip}>{st.stageName}</Text> : null}
                {st.m2Label ? <Text style={s.chip}>{st.m2Label}</Text> : null}
                {st.amountLabel ? <Text style={s.chip}>{st.amountLabel}</Text> : null}
              </View>
              {st.address ? <Text style={s.line}>Direccion: {st.address}</Text> : null}
              {st.contactName ? <Text style={s.line}>Contacto: {st.contactName}</Text> : null}
              {st.phone ? <Text style={s.line}>Tel: {st.phone}</Text> : null}
              {st.notes ? <Text style={s.line}>Notas: {st.notes}</Text> : null}
            </View>
            <Text style={s.km}>{st.legKm}</Text>
          </View>
        ))}

        <Text style={s.foot} fixed>
          RC Pisos Industriales · Hoja de ruta generada el {data.date}. Distancias por ruta de manejo.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderTripPdf(data: TripPdfData): Promise<Buffer> {
  return renderToBuffer(<TripDoc data={data} />);
}

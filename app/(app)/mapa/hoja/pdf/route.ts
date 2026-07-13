import { requireActiveUser } from "@/lib/auth";
import { renderTripPdf, type TripPdfData, type TripPdfStop } from "@/lib/trip-pdf";

/** Genera y descarga la hoja de ruta en PDF. Recibe los datos ya mostrados. */
export async function POST(request: Request) {
  await requireActiveUser();

  let body: Partial<TripPdfData>;
  try {
    body = (await request.json()) as Partial<TripPdfData>;
  } catch {
    return new Response("Datos inválidos.", { status: 400 });
  }

  const str = (v: unknown, max = 200) => (v == null ? null : String(v).slice(0, max));
  const req = (v: unknown, fallback: string, max = 120) => str(v, max) || fallback;

  const stopsRaw = Array.isArray(body.stops) ? body.stops.slice(0, 30) : [];
  const stops: TripPdfStop[] = stopsRaw.map((r, i) => ({
    order: Number((r as TripPdfStop).order) || i + 1,
    name: req((r as TripPdfStop).name, "Visita"),
    title: str((r as TripPdfStop).title),
    stageName: str((r as TripPdfStop).stageName, 40),
    m2Label: str((r as TripPdfStop).m2Label, 40),
    amountLabel: str((r as TripPdfStop).amountLabel, 40),
    address: str((r as TripPdfStop).address, 200),
    contactName: str((r as TripPdfStop).contactName, 80),
    phone: str((r as TripPdfStop).phone, 40),
    notes: str((r as TripPdfStop).notes, 300),
    legKm: req((r as TripPdfStop).legKm, ""),
  }));

  if (stops.length === 0) return new Response("No hay visitas.", { status: 400 });

  const data: TripPdfData = {
    title: req(body.title, "Hoja de ruta"),
    date: req(body.date, ""),
    origin: req(body.origin, "—"),
    returnLabel: req(body.returnLabel, ""),
    totalKm: req(body.totalKm, ""),
    totalTime: req(body.totalTime, ""),
    fuelCost: req(body.fuelCost, ""),
    stops,
    narrative: str(body.narrative, 2000),
  };

  try {
    const buffer = await renderTripPdf(data);
    const safe = data.title.replace(/[^a-z0-9áéíóúñ ]/gi, "").trim().slice(0, 50) || "hoja-de-ruta";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safe}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Trip PDF render failed:", error);
    return new Response("No se pudo generar el PDF.", { status: 500 });
  }
}

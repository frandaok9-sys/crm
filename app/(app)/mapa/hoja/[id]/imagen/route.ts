import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canViewAllRecords } from "@/lib/permissions";

/**
 * Imagen (SVG) de una hoja de ruta guardada: el recorrido con las paradas
 * numeradas y la salida, para la "captura del mapa" del asistente. Es
 * autocontenida (sin recursos externos) para que se pueda mostrar como <img>.
 */

const RED = "#d6301c";
const NAVY = "#0b2545";

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Pt = { lat: number; lng: number };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireActiveUser();
  const trip = await prisma.savedTrip.findUnique({ where: { id } });
  if (!trip) return new Response("No existe", { status: 404 });
  if (trip.ownerId !== user.id && !canViewAllRecords(user)) {
    return new Response("No autorizado", { status: 403 });
  }

  const data = trip.data as {
    plan?: {
      origin?: Pt & { label?: string };
      stops?: (Pt & { order: number; name: string })[];
      polyline?: [number, number][];
      totalKm?: number;
    };
  };
  const plan = data?.plan;
  const stops = plan?.stops ?? [];
  const origin = plan?.origin;
  const poly = plan?.polyline ?? [];
  if (stops.length === 0 && poly.length === 0) {
    return new Response("Sin datos de ruta", { status: 404 });
  }

  // Bounding box de todos los puntos.
  const all: [number, number][] = [...poly];
  if (origin) all.push([origin.lat, origin.lng]);
  for (const s of stops) all.push([s.lat, s.lng]);
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [la, ln] of all) {
    minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la);
    minLng = Math.min(minLng, ln); maxLng = Math.max(maxLng, ln);
  }
  const midLat = (minLat + maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180) || 1; // compresión de longitud
  const W = 640, H = 420, pad = 46;
  const spanX = Math.max((maxLng - minLng) * kx, 1e-4);
  const spanY = Math.max(maxLat - minLat, 1e-4);
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  const px = (la: number, ln: number): [number, number] => [
    offX + (ln - minLng) * kx * scale,
    offY + (maxLat - la) * scale, // y invertido
  ];

  const path = poly.length
    ? "M" + poly.map(([la, ln]) => px(la, ln).map((n) => n.toFixed(1)).join(",")).join(" L ")
    : stops.length
      ? "M" +
        [origin ? [origin.lat, origin.lng] : null, ...stops.map((s) => [s.lat, s.lng] as [number, number])]
          .filter(Boolean)
          .map((p) => px((p as number[])[0], (p as number[])[1]).map((n) => n.toFixed(1)).join(","))
          .join(" L ")
      : "";

  let markers = "";
  if (origin) {
    const [x, y] = px(origin.lat, origin.lng);
    markers += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${NAVY}" stroke="#fff" stroke-width="2.5"/>`;
  }
  for (const s of stops) {
    const [x, y] = px(s.lat, s.lng);
    const label = esc(s.name.length > 18 ? s.name.slice(0, 17) + "…" : s.name);
    markers +=
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="${RED}" stroke="#fff" stroke-width="2.5"/>` +
      `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="12" font-weight="bold" fill="#fff" text-anchor="middle" font-family="sans-serif">${s.order}</text>` +
      `<text x="${(x + 15).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="11" fill="#1a1b1f" font-family="sans-serif">${label}</text>`;
  }

  const caption = `${stops.length} visita${stops.length === 1 ? "" : "s"}${
    plan?.totalKm ? ` · ${Math.round(plan.totalKm)} km` : ""
  }`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="14" fill="#eef1f5"/>
<rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="10" fill="#f7f9fb" stroke="#dfe4ea"/>
${path ? `<path d="${path}" fill="none" stroke="${RED}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>` : ""}
${markers}
<text x="18" y="${H - 16}" font-size="12" font-weight="bold" fill="${NAVY}" font-family="sans-serif">Hoja de ruta · ${esc(caption)}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

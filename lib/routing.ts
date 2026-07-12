/**
 * Motor de rutas para el planificador de viajes de los vendedores.
 *
 * - Distancias y orden de visitas se calculan acá (nunca en la IA).
 * - El km y el trazado "reales" (por calles) salen de OSRM, el ruteador libre
 *   del ecosistema OpenStreetMap (mismo que ya usamos con Nominatim/CARTO).
 * - Si OSRM no responde, se estima con distancia geográfica × factor de calle,
 *   así el planificador nunca queda inutilizable.
 */

export type Geo = { lat: number; lng: number };

const EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Distancia en línea recta (haversine), en km. */
export function haversineKm(a: Geo, b: Geo): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Factor de "calle": las rutas reales son más largas que la línea recta. */
const ROAD_FACTOR = 1.32;

// ---------------------------------------------------------------------------
// Orden de visitas (TSP chico: vecino más cercano + mejora 2-opt)
// ---------------------------------------------------------------------------

/**
 * Ordena las paradas para minimizar el recorrido desde el origen.
 * Devuelve los índices de `stops` en el orden de visita.
 */
export function orderStops(origin: Geo, stops: Geo[]): number[] {
  const n = stops.length;
  if (n <= 1) return stops.map((_, i) => i);

  // 1) Vecino más cercano.
  const pending = new Set(stops.map((_, i) => i));
  const order: number[] = [];
  let current = origin;
  while (pending.size > 0) {
    let best = -1;
    let bestD = Infinity;
    for (const i of pending) {
      const d = haversineKm(current, stops[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    order.push(best);
    pending.delete(best);
    current = stops[best];
  }

  // 2) Mejora 2-opt (invierte tramos si acorta el total). N chico → barato.
  const path = [origin, ...order.map((i) => stops[i])];
  const legLen = (a: Geo, b: Geo) => haversineKm(a, b);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < path.length - 1; i++) {
      for (let k = i + 1; k < path.length; k++) {
        const before =
          legLen(path[i - 1], path[i]) +
          (k + 1 < path.length ? legLen(path[k], path[k + 1]) : 0);
        const after =
          legLen(path[i - 1], path[k]) +
          (k + 1 < path.length ? legLen(path[i], path[k + 1]) : 0);
        if (after + 1e-9 < before) {
          const seg = path.slice(i, k + 1).reverse();
          path.splice(i, seg.length, ...seg);
          improved = true;
        }
      }
    }
  }

  // Reconstruir los índices originales según el orden final (sin el origen).
  const idxOf = new Map<Geo, number>();
  order.forEach((origIdx) => idxOf.set(stops[origIdx], origIdx));
  return path.slice(1).map((g) => idxOf.get(g)!);
}

// ---------------------------------------------------------------------------
// Ruta real por calles (OSRM) con estimación de respaldo
// ---------------------------------------------------------------------------

export type LegInfo = { km: number; minutes: number };

export type RouteGeometry = {
  totalKm: number;
  totalMinutes: number;
  legs: LegInfo[]; // un tramo por par consecutivo de puntos
  polyline: [number, number][]; // [lat,lng] para dibujar en el mapa
  estimated: boolean; // true = OSRM no respondió, es aproximado
};

const OSRM = "https://router.project-osrm.org/route/v1/driving";

/** Ruta de manejo pasando por todos los puntos en orden (origen → paradas [→ origen]). */
export async function drivingRoute(points: Geo[]): Promise<RouteGeometry> {
  if (points.length < 2) {
    return { totalKm: 0, totalMinutes: 0, legs: [], polyline: [], estimated: false };
  }
  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${OSRM}/${coords}?overview=full&geometries=geojson&steps=false&annotations=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "RC-CRM/1.0 (crm-rc-pisos)" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = (await res.json()) as {
      code: string;
      routes?: Array<{
        distance: number;
        duration: number;
        legs: Array<{ distance: number; duration: number }>;
        geometry: { coordinates: [number, number][] };
      }>;
    };
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) throw new Error("OSRM sin ruta");
    return {
      totalKm: route.distance / 1000,
      totalMinutes: route.duration / 60,
      legs: route.legs.map((l) => ({
        km: l.distance / 1000,
        minutes: l.duration / 60,
      })),
      polyline: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      estimated: false,
    };
  } catch {
    return estimateRoute(points);
  }
}

/** Respaldo: km por línea recta × factor de calle, ~50 km/h de promedio. */
function estimateRoute(points: Geo[]): RouteGeometry {
  const legs: LegInfo[] = [];
  const polyline: [number, number][] = points.map((p) => [p.lat, p.lng]);
  let totalKm = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const km = haversineKm(points[i], points[i + 1]) * ROAD_FACTOR;
    legs.push({ km, minutes: (km / 50) * 60 });
    totalKm += km;
  }
  const totalMinutes = legs.reduce((s, l) => s + l.minutes, 0);
  return { totalKm, totalMinutes, legs, polyline, estimated: true };
}

// ---------------------------------------------------------------------------
// Leads "en el camino" (corredor alrededor de la ruta)
// ---------------------------------------------------------------------------

/** Distancia aproximada de un punto al segmento a-b, en km (equirectangular). */
function pointToSegmentKm(p: Geo, a: Geo, b: Geo): number {
  const latRef = toRad((a.lat + b.lat) / 2);
  const x = (g: Geo) => toRad(g.lng) * Math.cos(latRef) * EARTH_KM;
  const y = (g: Geo) => toRad(g.lat) * EARTH_KM;
  const px = x(p),
    py = y(p),
    ax = x(a),
    ay = y(a),
    bx = x(b),
    by = y(b);
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx,
    cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Distancia mínima de un punto a una polilínea (la ruta), en km. */
export function distanceToRouteKm(p: Geo, polyline: [number, number][]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return haversineKm(p, { lat: polyline[0][0], lng: polyline[0][1] });
  }
  let best = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = { lat: polyline[i][0], lng: polyline[i][1] };
    const b = { lat: polyline[i + 1][0], lng: polyline[i + 1][1] };
    best = Math.min(best, pointToSegmentKm(p, a, b));
    if (best < 0.05) break;
  }
  return best;
}

/** Costo de combustible del viaje. */
export function fuelCost(
  totalKm: number,
  litersPer100Km: number,
  pricePerLiter: number
): number {
  return (totalKm / 100) * litersPer100Km * pricePerLiter;
}

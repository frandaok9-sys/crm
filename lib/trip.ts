import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/prisma";
import { opportunityScope, clientScope, type Principal } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import {
  drivingRoute,
  orderStops,
  distanceToRouteKm,
  routeBoundingBox,
  fuelCost,
  type Geo,
} from "@/lib/routing";

/**
 * Planificador de viajes: arma la hoja de ruta de un vendedor.
 *
 * Las paradas pueden ser OBRAS de su cartera (respetando permisos) o destinos
 * de PROSPECCIÓN cargados a mano (una dirección o ciudad). Todo el cálculo
 * (orden, km, tiempo, costo, leads del corredor) es determinístico. La IA solo
 * REDACTA la hoja de ruta, en un paso aparte (planTrip es rápido; la narrativa
 * llega después).
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

export type TripWaypoint =
  | { kind: "opportunity"; id: string }
  | { kind: "custom"; id: string; lat: number; lng: number; label: string };

export type TripPoint = { lat: number; lng: number; label: string };

/** Cómo termina el viaje: vuelve a la salida, termina en otro punto, o sin vuelta. */
export type ReturnMode = "origin" | "point" | "none";

export type TripInput = {
  origin: TripPoint;
  waypoints: TripWaypoint[];
  returnMode: ReturnMode;
  endPoint?: TripPoint | null; // destino final si returnMode === "point"
  litersPer100Km: number;
  pricePerLiter: number;
  corridorKm: number; // ancho del corredor para buscar leads (por lado)
};

export type TripStop = {
  id: string;
  kind: "opportunity" | "custom";
  order: number;
  name: string; // razón social (obra) o etiqueta del destino (prospección)
  city: string | null; // ciudad (para la prospección web por zona)
  stageName: string | null;
  m2Label: string | null;
  amountLabel: string | null;
  lat: number;
  lng: number;
  legKm: number;
  cumKm: number;
};

export type TripLead = {
  id: string;
  clientName: string;
  title: string;
  stageName: string;
  m2Label: string | null;
  detourKm: number;
  lat: number;
  lng: number;
};

/** Cliente de la cartera en el camino, SIN obra en el pipeline (visita/prospección). */
export type TripClientVisit = {
  id: string;
  name: string;
  city: string | null;
  segment: string | null;
  detourKm: number;
  lat: number;
  lng: number;
};

export type TripPlan = {
  origin: TripInput["origin"];
  stops: TripStop[];
  leads: TripLead[];
  clientVisits: TripClientVisit[];
  totalKm: number;
  totalMinutes: number;
  fuelCost: number;
  estimated: boolean;
  returnMode: ReturnMode;
  endPoint: TripPoint | null;
  polyline: [number, number][];
  narrative: string; // se completa en un segundo paso (narrateTrip)
};

function fmtKm(km: number): string {
  return `${km.toLocaleString("es-AR", { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}
function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** Arma la hoja de ruta (sin la narrativa). Respeta el alcance del usuario. */
export async function planTrip(
  user: Principal & { name?: string | null },
  input: TripInput
): Promise<TripPlan> {
  const { origin, returnMode, litersPer100Km, pricePerLiter, corridorKm } = input;
  const endPoint = returnMode === "point" ? input.endPoint ?? null : null;

  const oppIds = input.waypoints
    .filter((w): w is Extract<TripWaypoint, { kind: "opportunity" }> => w.kind === "opportunity")
    .map((w) => w.id);
  const customs = input.waypoints.filter(
    (w): w is Extract<TripWaypoint, { kind: "custom" }> => w.kind === "custom"
  );

  // Obras: solo las de la cartera del usuario (capa central de permisos).
  const scope = opportunityScope(user);
  const opps = oppIds.length
    ? await prisma.opportunity.findMany({
        where: { ...scope, id: { in: oppIds }, latitude: { not: null }, longitude: { not: null } },
        include: {
          client: { select: { legalName: true, city: true } },
          stage: { select: { name: true } },
        },
      })
    : [];

  type Resolved = Geo & {
    id: string;
    kind: "opportunity" | "custom";
    name: string;
    city: string | null;
    stageName: string | null;
    m2Label: string | null;
    amountLabel: string | null;
  };

  const resolved: Resolved[] = [
    ...opps.map((o) => ({
      lat: Number(o.latitude),
      lng: Number(o.longitude),
      id: o.id,
      kind: "opportunity" as const,
      name: o.client.legalName,
      city: o.client.city,
      stageName: o.stage.name,
      m2Label: o.estimatedM2
        ? `${Number(o.estimatedM2).toLocaleString("es-AR")} m²`
        : null,
      amountLabel: formatMoney(o.amount ? o.amount.toString() : null, o.currency),
    })),
    ...customs.map((c) => ({
      lat: c.lat,
      lng: c.lng,
      id: c.id,
      kind: "custom" as const,
      name: c.label,
      city: c.label, // el destino tipeado suele ser una ciudad
      stageName: "Prospección" as string | null,
      m2Label: null,
      amountLabel: null,
    })),
  ];

  // 1) Orden óptimo desde el origen.
  const order = orderStops(origin, resolved);
  const ordered = order.map((i) => resolved[i]);

  // 2) Ruta real por calles (salida → paradas → vuelta según returnMode).
  const finalPoint: Geo | null =
    returnMode === "origin" ? origin : returnMode === "point" && endPoint ? endPoint : null;
  const routePoints: Geo[] = [
    origin,
    ...ordered.map((s) => ({ lat: s.lat, lng: s.lng })),
    ...(finalPoint ? [finalPoint] : []),
  ];
  const route = await drivingRoute(routePoints);

  // 3) Paradas con km por tramo y acumulado.
  let cum = 0;
  const stops: TripStop[] = ordered.map((s, idx) => {
    const legKm = route.legs[idx]?.km ?? 0;
    cum += legKm;
    return {
      id: s.id,
      kind: s.kind,
      order: idx + 1,
      name: s.name,
      city: s.city,
      stageName: s.stageName,
      m2Label: s.m2Label,
      amountLabel: s.amountLabel,
      lat: s.lat,
      lng: s.lng,
      legKm,
      cumKm: cum,
    };
  });

  // Caja geográfica de la ruta: pre-filtra en la BASE qué está cerca del camino
  // (así escala a carteras de miles sin traer todo ni cortar por un `take`).
  const bbox = routeBoundingBox(route.polyline, corridorKm);
  const inCorridorBox = bbox
    ? {
        latitude: { gte: bbox.minLat, lte: bbox.maxLat },
        longitude: { gte: bbox.minLng, lte: bbox.maxLng },
      }
    : { latitude: { not: null }, longitude: { not: null } };

  // 4) Leads en el corredor: otras obras de la cartera cerca de la ruta.
  const excluded = new Set(oppIds);
  const candidates = await prisma.opportunity.findMany({
    where: {
      ...scope,
      id: { notIn: [...excluded] },
      ...inCorridorBox,
    },
    include: {
      client: { select: { legalName: true } },
      stage: { select: { name: true } },
    },
    take: 1000,
  });

  const leads: TripLead[] = candidates
    .map((o) => {
      const p = { lat: Number(o.latitude), lng: Number(o.longitude) };
      return { o, p, detourKm: distanceToRouteKm(p, route.polyline) };
    })
    .filter((c) => c.detourKm <= corridorKm)
    .sort((a, b) => a.detourKm - b.detourKm)
    .slice(0, 6)
    .map((c) => ({
      id: c.o.id,
      clientName: c.o.client.legalName,
      title: c.o.title,
      stageName: c.o.stage.name,
      m2Label: c.o.estimatedM2
        ? `${Number(c.o.estimatedM2).toLocaleString("es-AR")} m²`
        : null,
      detourKm: c.detourKm,
      lat: c.p.lat,
      lng: c.p.lng,
    }));

  // 5) Clientes de la cartera en el camino SIN obra en el pipeline: cuentas
  //    para visitar/reactivar aunque no tengan una oportunidad cargada.
  const customClientIds = customs
    .map((c) => (c.id.startsWith("client-") ? c.id.slice("client-".length) : null))
    .filter((x): x is string => !!x);
  const excludedClients = new Set<string>([
    ...customClientIds,
    ...opps.map((o) => o.clientId),
  ]);
  const cartera = await prisma.client.findMany({
    where: {
      ...clientScope(user),
      ...inCorridorBox,
      id: { notIn: [...excludedClients] },
      opportunities: { none: {} }, // sin nada en el pipeline
    },
    select: {
      id: true,
      legalName: true,
      city: true,
      segment: true,
      latitude: true,
      longitude: true,
    },
    take: 1000,
  });

  const clientVisits: TripClientVisit[] = cartera
    .map((c) => {
      const p = { lat: Number(c.latitude), lng: Number(c.longitude) };
      return { c, p, detourKm: distanceToRouteKm(p, route.polyline) };
    })
    .filter((x) => x.detourKm <= corridorKm)
    .sort((a, b) => a.detourKm - b.detourKm)
    .slice(0, 6)
    .map((x) => ({
      id: x.c.id,
      name: x.c.legalName,
      city: x.c.city,
      segment: x.c.segment,
      detourKm: x.detourKm,
      lat: x.p.lat,
      lng: x.p.lng,
    }));

  return {
    origin,
    stops,
    leads,
    clientVisits,
    totalKm: route.totalKm,
    totalMinutes: route.totalMinutes,
    fuelCost: fuelCost(route.totalKm, litersPer100Km, pricePerLiter),
    estimated: route.estimated,
    returnMode,
    endPoint,
    polyline: route.polyline,
    narrative: "",
  };
}

// ---------------------------------------------------------------------------
// Redacción de la hoja de ruta (IA) — paso aparte, con los números ya listos
// ---------------------------------------------------------------------------

export type NarrateInput = {
  origin: string;
  returnLabel: string; // "vuelve a la salida" | "termina en X" | "sin vuelta"
  totalKm: number;
  totalMinutes: number;
  fuelCost: number;
  estimated: boolean;
  stops: { order: number; name: string; stageName: string | null; m2Label: string | null; legKm: number }[];
  leads: { clientName: string; stageName: string; m2Label: string | null; detourKm: number }[];
  clientVisits: { name: string; city: string | null; segment: string | null; detourKm: number }[];
};

/** Redacta la hoja de ruta con la IA (o un texto básico si no hay API). */
export async function narrateTrip(d: NarrateInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackNarrative(d);

  const digest = {
    origen: d.origin,
    vuelta: d.returnLabel,
    total: `${fmtKm(d.totalKm)} · ${fmtDur(d.totalMinutes)}`,
    combustible: `$${Math.round(d.fuelCost).toLocaleString("es-AR")}`,
    estimado: d.estimated,
    paradas: d.stops.map((s) => ({
      n: s.order,
      destino: s.name,
      etapa: s.stageName,
      m2: s.m2Label,
      tramo: fmtKm(s.legKm),
    })),
    leads_en_camino: d.leads.map((l) => ({
      cliente: l.clientName,
      etapa: l.stageName,
      m2: l.m2Label,
      desvio: fmtKm(l.detourKm),
    })),
    clientes_cartera_sin_obra: d.clientVisits.map((c) => ({
      cliente: c.name,
      ciudad: c.city,
      segmento: c.segment,
      desvio: fmtKm(c.detourKm),
    })),
  };

  const system = `Sos el asistente de campo de RC Pisos Industriales (pisos industriales por m² en Mendoza). Redactás la HOJA DE RUTA de una jornada para un vendedor viajante que combina visitas a obras y prospección de clientes nuevos. Español rioplatense, concreto, motivador pero sin relleno.

REGLAS:
- Usá EXACTAMENTE los números del digest (ya calculados). No inventes ni recalcules km, tiempo ni costo.
- Las paradas con etapa "Prospección" son destinos nuevos (una ciudad o zona para buscar clientes), no obras existentes: tratalas como oportunidad de prospección.
- Formato Markdown, breve:
  1) Una línea de resumen (total km, tiempo, costo de combustible).
  2) Sección "Recorrido": las paradas en orden con su tramo, una por línea.
  3) Sección "Aprovechá en el camino": por cada lead (obra del pipeline), 1 frase con por qué conviene pasar (etapa temprana = oportunidad fresca; m² grande = obra importante; desvío chico = casi sin costo). Si no hay leads, omití la sección.
  4) Sección "Cuentas para reactivar": por cada cliente de "clientes_cartera_sin_obra" (clientes de la cartera SIN obra en el pipeline), 1 frase para pasar a visitarlo y generar una oportunidad nueva. Si no hay, omití la sección.
- Si "estimado" es true, aclaralo en una línea corta (km aproximados).
- No repitas toda la tabla; la interfaz ya la muestra. Aportá criterio comercial.`;

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.4,
      system,
      messages: [{ role: "user", content: JSON.stringify(digest) }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return text || fallbackNarrative(d);
  } catch {
    return fallbackNarrative(d);
  }
}

/** Hoja de ruta básica sin IA (si falla la API), para no dejar al vendedor sin nada. */
function fallbackNarrative(d: NarrateInput): string {
  const lines = [
    `**Viaje:** ${fmtKm(d.totalKm)} · ${fmtDur(d.totalMinutes)} · combustible ~$${Math.round(
      d.fuelCost
    ).toLocaleString("es-AR")}${d.estimated ? " (estimado)" : ""}.`,
    "",
    "**Recorrido:**",
    ...d.stops.map((s) => `${s.order}. ${s.name} — ${s.stageName ?? ""} (${fmtKm(s.legKm)})`),
  ];
  if (d.leads.length > 0) {
    lines.push("", "**Aprovechá en el camino:**");
    lines.push(
      ...d.leads.map(
        (l) => `- ${l.clientName} (${l.stageName}${l.m2Label ? `, ${l.m2Label}` : ""}) a ${fmtKm(l.detourKm)} del camino.`
      )
    );
  }
  return lines.join("\n");
}

import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/prisma";
import { opportunityScope, type Principal } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import {
  drivingRoute,
  orderStops,
  distanceToRouteKm,
  fuelCost,
  type Geo,
} from "@/lib/routing";

/**
 * Planificador de viajes: arma la hoja de ruta de un vendedor.
 * Todo el cálculo (orden, km, tiempo, costo, leads del corredor) es
 * determinístico y respeta permisos (solo la cartera del usuario). La IA
 * únicamente REDACTA la hoja de ruta con esos números ya calculados.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

export type TripInput = {
  origin: { lat: number; lng: number; label: string };
  stopIds: string[];
  roundTrip: boolean;
  litersPer100Km: number;
  pricePerLiter: number;
  corridorKm: number; // ancho del corredor para buscar leads (por lado)
};

export type TripStop = {
  id: string;
  order: number;
  clientName: string;
  title: string;
  m2Label: string | null;
  amountLabel: string | null;
  stageName: string;
  lat: number;
  lng: number;
  legKm: number; // km desde la parada anterior (u origen)
  cumKm: number; // km acumulado hasta esta parada
};

export type TripLead = {
  id: string;
  clientName: string;
  title: string;
  stageName: string;
  m2Label: string | null;
  detourKm: number; // distancia al camino
  lat: number;
  lng: number;
};

export type TripPlan = {
  origin: TripInput["origin"];
  stops: TripStop[];
  leads: TripLead[];
  totalKm: number;
  totalMinutes: number;
  fuelCost: number;
  estimated: boolean;
  roundTrip: boolean;
  polyline: [number, number][];
  narrative: string;
};

function fmtKm(km: number): string {
  return `${km.toLocaleString("es-AR", { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** Arma la hoja de ruta completa. Respeta el alcance del usuario. */
export async function planTrip(
  user: Principal & { name?: string | null },
  input: TripInput
): Promise<TripPlan> {
  const {
    origin,
    roundTrip,
    litersPer100Km,
    pricePerLiter,
    corridorKm,
  } = input;

  // Solo obras de la cartera del usuario (capa central de permisos).
  const scope = opportunityScope(user);
  const selected = await prisma.opportunity.findMany({
    where: {
      ...scope,
      id: { in: input.stopIds },
      latitude: { not: null },
      longitude: { not: null },
    },
    include: {
      client: { select: { legalName: true } },
      stage: { select: { name: true } },
    },
  });

  const stopsGeo: (Geo & { op: (typeof selected)[number] })[] = selected.map((o) => ({
    lat: Number(o.latitude),
    lng: Number(o.longitude),
    op: o,
  }));

  // 1) Orden óptimo desde el origen.
  const order = orderStops(origin, stopsGeo);
  const ordered = order.map((i) => stopsGeo[i]);

  // 2) Ruta real por calles (origen → paradas [→ origen]).
  const routePoints: Geo[] = [
    origin,
    ...ordered.map((s) => ({ lat: s.lat, lng: s.lng })),
    ...(roundTrip ? [origin] : []),
  ];
  const route = await drivingRoute(routePoints);

  // 3) Paradas con km por tramo y acumulado.
  let cum = 0;
  const stops: TripStop[] = ordered.map((s, idx) => {
    const legKm = route.legs[idx]?.km ?? 0;
    cum += legKm;
    return {
      id: s.op.id,
      order: idx + 1,
      clientName: s.op.client.legalName,
      title: s.op.title,
      m2Label: s.op.estimatedM2
        ? `${Number(s.op.estimatedM2).toLocaleString("es-AR")} m²`
        : null,
      amountLabel: formatMoney(s.op.amount ? s.op.amount.toString() : null, s.op.currency),
      stageName: s.op.stage.name,
      lat: s.lat,
      lng: s.lng,
      legKm,
      cumKm: cum,
    };
  });

  // 4) Leads en el corredor: otras obras de la cartera cerca de la ruta.
  const selectedIds = new Set(input.stopIds);
  const candidates = await prisma.opportunity.findMany({
    where: {
      ...scope,
      id: { notIn: [...selectedIds] },
      latitude: { not: null },
      longitude: { not: null },
    },
    include: {
      client: { select: { legalName: true } },
      stage: { select: { name: true } },
    },
    take: 400,
  });

  const leads: TripLead[] = candidates
    .map((o) => {
      const p = { lat: Number(o.latitude), lng: Number(o.longitude) };
      const detourKm = distanceToRouteKm(p, route.polyline);
      return { o, p, detourKm };
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

  const cost = fuelCost(route.totalKm, litersPer100Km, pricePerLiter);

  // 5) La IA redacta la hoja de ruta con los números ya calculados.
  const narrative = await writeNarrative(user, {
    origin: origin.label,
    roundTrip,
    totalKm: route.totalKm,
    totalMinutes: route.totalMinutes,
    fuelCost: cost,
    estimated: route.estimated,
    stops,
    leads,
  });

  return {
    origin,
    stops,
    leads,
    totalKm: route.totalKm,
    totalMinutes: route.totalMinutes,
    fuelCost: cost,
    estimated: route.estimated,
    roundTrip,
    polyline: route.polyline,
    narrative,
  };
}

// ---------------------------------------------------------------------------
// Redacción de la hoja de ruta (IA) — digest mínimo, sin recalcular números
// ---------------------------------------------------------------------------

type NarrativeInput = {
  origin: string;
  roundTrip: boolean;
  totalKm: number;
  totalMinutes: number;
  fuelCost: number;
  estimated: boolean;
  stops: TripStop[];
  leads: TripLead[];
};

async function writeNarrative(
  user: { name?: string | null },
  d: NarrativeInput
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackNarrative(d);

  // Digest compacto: strings ya formateados, la IA no hace cuentas.
  const digest = {
    origen: d.origin,
    vuelta_al_origen: d.roundTrip,
    total: `${fmtKm(d.totalKm)} · ${fmtDur(d.totalMinutes)}`,
    combustible: `$${Math.round(d.fuelCost).toLocaleString("es-AR")}`,
    estimado: d.estimated,
    paradas: d.stops.map((s) => ({
      n: s.order,
      cliente: s.clientName,
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
  };

  const system = `Sos el asistente de campo de RC Pisos Industriales (pisos industriales por m² en Mendoza). Redactás la HOJA DE RUTA de una jornada de visitas para un vendedor. Español rioplatense, concreto, motivador pero sin relleno.

REGLAS:
- Usá EXACTAMENTE los números del digest (ya calculados). No inventes ni recalcules km, tiempo ni costo.
- Formato Markdown, breve:
  1) Una línea de resumen (total km, tiempo, costo de combustible).
  2) Sección "Recorrido": las paradas en orden con su tramo, una por línea.
  3) Sección "Aprovechá en el camino": por cada lead, 1 frase con por qué conviene pasar (etapa temprana = oportunidad fresca; m² grande = obra importante; desvío chico = casi sin costo). Si no hay leads, omití la sección.
- Si "estimado" es true, aclaralo en una línea corta (km aproximados, sin señal de ruteo).
- No repitas toda la tabla de datos; la interfaz ya la muestra. Aportá criterio comercial.`;

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.4,
      system,
      messages: [{ role: "user", content: JSON.stringify(digest) }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return text || fallbackNarrative(d);
  } catch {
    return fallbackNarrative(d);
  }
}

/** Hoja de ruta básica sin IA (si falla la API), para no dejar al vendedor sin nada. */
function fallbackNarrative(d: NarrativeInput): string {
  const lines = [
    `**Viaje:** ${fmtKm(d.totalKm)} · ${fmtDur(d.totalMinutes)} · combustible ~$${Math.round(
      d.fuelCost
    ).toLocaleString("es-AR")}${d.estimated ? " (estimado)" : ""}.`,
    "",
    "**Recorrido:**",
    ...d.stops.map((s) => `${s.order}. ${s.clientName} — ${s.stageName} (${fmtKm(s.legKm)})`),
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

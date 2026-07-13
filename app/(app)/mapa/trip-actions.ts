"use server";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canViewAllRecords } from "@/lib/permissions";
import { geocodeAddress } from "@/lib/geocode";
import { findWebProspects, type CityProspects } from "@/lib/prospects";
import {
  planTrip,
  narrateTrip,
  type TripInput,
  type TripPlan,
  type TripWaypoint,
  type NarrateInput,
} from "@/lib/trip";

const MAX_STOPS = 15;

function clamp(n: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Convierte una dirección o ciudad escrita en un punto (lat/lng). */
export async function geocodePointAction(
  query: string
): Promise<{ ok: true; lat: number; lng: number; label: string } | { ok: false; error: string }> {
  await requireActiveUser();
  const q = String(query || "").trim();
  if (q.length < 3) return { ok: false, error: "Escribí una dirección o ciudad más completa." };
  try {
    const point = await geocodeAddress(`${q}, Argentina`);
    if (!point) return { ok: false, error: "No encontré ese lugar. Probá con la ciudad." };
    return { ok: true, lat: Number(point.lat), lng: Number(point.lng), label: q };
  } catch {
    return { ok: false, error: "No se pudo buscar el lugar. Reintentá." };
  }
}

/** Normaliza y valida los destinos (obras + destinos de prospección). */
function parseWaypoints(raw: unknown): TripWaypoint[] {
  if (!Array.isArray(raw)) return [];
  const out: TripWaypoint[] = [];
  for (const w of raw) {
    if (!w || typeof w !== "object") continue;
    const kind = (w as { kind?: string }).kind;
    if (kind === "opportunity" && typeof (w as { id?: unknown }).id === "string") {
      out.push({ kind: "opportunity", id: (w as { id: string }).id });
    } else if (kind === "custom") {
      const c = w as { id?: unknown; lat?: unknown; lng?: unknown; label?: unknown };
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      if (typeof c.id === "string" && Number.isFinite(lat) && Number.isFinite(lng)) {
        out.push({
          kind: "custom",
          id: c.id,
          lat,
          lng,
          label: String(c.label || "Destino").slice(0, 120),
        });
      }
    }
  }
  // Deduplicar por id y respetar el tope.
  const seen = new Set<string>();
  return out.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true))).slice(0, MAX_STOPS);
}

function pointOrNull(p: unknown): { lat: number; lng: number; label: string } | null {
  if (!p || typeof p !== "object") return null;
  const o = p as { lat?: unknown; lng?: unknown; label?: unknown };
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: String(o.label || "").slice(0, 120) };
}

/** Arma la hoja de ruta (sin narrativa). Aplica permisos dentro de planTrip(). */
export async function planTripAction(raw: {
  origin: { lat: number; lng: number; label: string };
  waypoints: unknown;
  returnMode: string;
  endPoint?: unknown;
  litersPer100Km: number;
  pricePerLiter: number;
  corridorKm: number;
}): Promise<{ ok: true; plan: TripPlan } | { ok: false; error: string }> {
  const user = await requireActiveUser();

  const lat = Number(raw.origin?.lat);
  const lng = Number(raw.origin?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Falta un punto de partida válido." };
  }

  const waypoints = parseWaypoints(raw.waypoints);
  if (waypoints.length === 0) {
    return { ok: false, error: "Sumá al menos un destino (una obra o una ciudad)." };
  }

  const returnMode: TripInput["returnMode"] =
    raw.returnMode === "point" ? "point" : raw.returnMode === "none" ? "none" : "origin";
  const endPoint = returnMode === "point" ? pointOrNull(raw.endPoint) : null;
  if (returnMode === "point" && !endPoint) {
    return { ok: false, error: "Fijá el punto de vuelta o cambiá la opción de regreso." };
  }

  const input: TripInput = {
    origin: { lat, lng, label: String(raw.origin.label || "Punto de partida").slice(0, 120) },
    waypoints,
    returnMode,
    endPoint,
    litersPer100Km: clamp(Number(raw.litersPer100Km), 2, 40, 8),
    pricePerLiter: clamp(Number(raw.pricePerLiter), 1, 100000, 1200),
    corridorKm: clamp(Number(raw.corridorKm), 1, 50, 10),
  };

  try {
    const plan = await planTrip(user, input);
    if (plan.stops.length === 0) {
      return { ok: false, error: "No se pudieron ubicar los destinos elegidos." };
    }
    return { ok: true, plan };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "No se pudo armar la hoja de ruta." };
  }
}

/**
 * Prospección web OPCIONAL: busca empresas nuevas en las ciudades del viaje.
 * Con costo (búsqueda web + IA), por eso es a pedido y con caché por ciudad.
 */
export async function findProspectsAction(
  cities: string[]
): Promise<{ ok: true; cities: CityProspects[]; error?: string } | { ok: false; error: string }> {
  await requireActiveUser();
  const list = Array.isArray(cities) ? cities.filter((c) => typeof c === "string") : [];
  if (list.length === 0) return { ok: false, error: "No hay ciudades en la ruta para prospectar." };
  try {
    const { cities: found, error } = await findWebProspects(list);
    return { ok: true, cities: found, error };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "No se pudo buscar prospectos." };
  }
}

/** Redacta la hoja de ruta con la IA (paso posterior, para no demorar el mapa). */
export async function narrateTripAction(
  input: NarrateInput
): Promise<{ ok: true; narrative: string } | { ok: false; error: string }> {
  await requireActiveUser();
  try {
    const narrative = await narrateTrip(input);
    return { ok: true, narrative };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "No se pudo redactar la hoja de ruta." };
  }
}

// ---------------------------------------------------------------------------
// Hojas de ruta guardadas
// ---------------------------------------------------------------------------

export type SavedTripSummary = {
  id: string;
  name: string;
  totalKm: number;
  createdAt: string;
  mine: boolean;
  data: unknown;
};

/** Confirma y guarda una hoja de ruta del vendedor. */
export async function saveTripAction(input: {
  name: string;
  totalKm: number;
  data: unknown;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireActiveUser();
  const name = String(input.name || "").trim().slice(0, 80) || "Hoja de ruta";
  const totalKm = Number(input.totalKm);
  if (!input.data || typeof input.data !== "object") {
    return { ok: false, error: "Faltan datos de la hoja de ruta." };
  }
  try {
    const saved = await prisma.savedTrip.create({
      data: {
        ownerId: user.id,
        name,
        totalKm: Number.isFinite(totalKm) ? totalKm : 0,
        data: input.data as object,
      },
    });
    return { ok: true, id: saved.id };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "No se pudo guardar." };
  }
}

/** Lista las hojas de ruta del vendedor (o todas, para gerente/admin). */
export async function listSavedTripsAction(): Promise<SavedTripSummary[]> {
  const user = await requireActiveUser();
  const where = canViewAllRecords(user) ? {} : { ownerId: user.id };
  const rows = await prisma.savedTrip.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    totalKm: r.totalKm,
    createdAt: r.createdAt.toISOString(),
    mine: r.ownerId === user.id,
    data: r.data,
  }));
}

/** Borra una hoja de ruta (solo el dueño, o gerente/admin). */
export async function deleteSavedTripAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireActiveUser();
  const trip = await prisma.savedTrip.findUnique({ where: { id } });
  if (!trip) return { ok: false, error: "No existe." };
  if (trip.ownerId !== user.id && !canViewAllRecords(user)) {
    return { ok: false, error: "No podés borrar esta hoja de ruta." };
  }
  await prisma.savedTrip.delete({ where: { id } });
  return { ok: true };
}

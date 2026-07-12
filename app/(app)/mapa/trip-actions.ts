"use server";

import { requireActiveUser } from "@/lib/auth";
import { geocodeAddress } from "@/lib/geocode";
import { planTrip, type TripInput, type TripPlan } from "@/lib/trip";

/** Convierte una dirección escrita en punto de partida (lat/lng). */
export async function geocodeOriginAction(
  query: string
): Promise<{ ok: true; lat: number; lng: number; label: string } | { ok: false; error: string }> {
  await requireActiveUser();
  const q = String(query || "").trim();
  if (q.length < 3) return { ok: false, error: "Escribí una dirección más completa." };
  try {
    const point = await geocodeAddress(`${q}, Argentina`);
    if (!point) return { ok: false, error: "No encontré esa dirección. Probá con la ciudad." };
    return {
      ok: true,
      lat: Number(point.lat),
      lng: Number(point.lng),
      label: q,
    };
  } catch {
    return { ok: false, error: "No se pudo buscar la dirección. Reintentá." };
  }
}

/** Límites sanos para no abusar del ruteador ni de la IA. */
const MAX_STOPS = 15;

function clamp(n: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * Arma la hoja de ruta del viaje. Valida todo del lado del servidor y aplica
 * los permisos del usuario (solo su cartera) dentro de planTrip().
 */
export async function planTripAction(raw: {
  origin: { lat: number; lng: number; label: string };
  stopIds: string[];
  roundTrip: boolean;
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

  const stopIds = Array.isArray(raw.stopIds)
    ? [...new Set(raw.stopIds.filter((s) => typeof s === "string"))].slice(0, MAX_STOPS)
    : [];
  if (stopIds.length === 0) {
    return { ok: false, error: "Elegí al menos una visita para armar el viaje." };
  }

  const input: TripInput = {
    origin: { lat, lng, label: String(raw.origin.label || "Punto de partida").slice(0, 120) },
    stopIds,
    roundTrip: !!raw.roundTrip,
    litersPer100Km: clamp(Number(raw.litersPer100Km), 2, 40, 8),
    pricePerLiter: clamp(Number(raw.pricePerLiter), 1, 100000, 1200),
    corridorKm: clamp(Number(raw.corridorKm), 1, 50, 10),
  };

  try {
    const plan = await planTrip(user, input);
    if (plan.stops.length === 0) {
      return { ok: false, error: "No se pudieron ubicar las visitas elegidas en tu cartera." };
    }
    return { ok: true, plan };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message || "No se pudo armar la hoja de ruta.",
    };
  }
}

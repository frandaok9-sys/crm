"use server";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canCreateTrips,
  canManageTrip,
  canViewAllRecords,
  clientScope,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { geocodeAddress, suggestPlaces, type PlaceSuggestion } from "@/lib/geocode";
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

/**
 * Tope de uso por usuario para las acciones con costo externo (IA / búsqueda
 * web). Cuenta las entradas recientes del AuditLog de esa acción — mismo
 * patrón que el chat del asistente. Devuelve true si todavía puede.
 */
async function withinActionLimit(
  userId: string,
  action: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  const count = await prisma.auditLog.count({
    where: {
      actorId: userId,
      action,
      createdAt: { gte: new Date(Date.now() - windowMs) },
    },
  });
  return count < max;
}

/** Autocompletado de lugares (tipo Maps): coincidencias reales para elegir. */
export async function placeSuggestAction(query: string): Promise<PlaceSuggestion[]> {
  await requireActiveUser();
  try {
    return await suggestPlaces(query);
  } catch {
    return [];
  }
}

export type ClientHit = {
  id: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
};

/** Busca clientes de la cartera (por nombre) ya ubicados, para sumarlos al viaje. */
export async function searchClientsAction(query: string): Promise<ClientHit[]> {
  const user = await requireActiveUser();
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const rows = await prisma.client.findMany({
    where: {
      ...clientScope(user),
      latitude: { not: null },
      longitude: { not: null },
      OR: [
        { legalName: { contains: q, mode: "insensitive" } },
        { tradeName: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, legalName: true, city: true, latitude: true, longitude: true },
    orderBy: { legalName: "asc" },
    take: 8,
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.legalName,
    city: c.city,
    lat: Number(c.latitude),
    lng: Number(c.longitude),
  }));
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
  const user = await requireActiveUser();
  const list = Array.isArray(cities) ? cities.filter((c) => typeof c === "string") : [];
  if (list.length === 0) return { ok: false, error: "No hay ciudades en la ruta para prospectar." };
  // Usa búsqueda web + IA (con costo real): tope por usuario por hora.
  if (!(await withinActionLimit(user.id, "prospects.searched", 10, 60 * 60_000))) {
    return { ok: false, error: "Alcanzaste el tope de búsquedas de prospectos por hora. Probá más tarde." };
  }
  try {
    const { cities: found, error } = await findWebProspects(list);
    await logAudit({
      action: "prospects.searched",
      actorId: user.id,
      metadata: { cities: list.slice(0, 5) },
    });
    return { ok: true, cities: found, error };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "No se pudo buscar prospectos." };
  }
}

/** Redacta la hoja de ruta con la IA (paso posterior, para no demorar el mapa). */
export async function narrateTripAction(
  input: NarrateInput
): Promise<{ ok: true; narrative: string } | { ok: false; error: string }> {
  const user = await requireActiveUser();
  // Llama a la IA (con costo): tope por usuario por hora.
  if (!(await withinActionLimit(user.id, "trip.narrated", 15, 60 * 60_000))) {
    return { ok: false, error: "Alcanzaste el tope de análisis con IA por hora. Probá más tarde." };
  }
  try {
    const narrative = await narrateTrip(input);
    await logAudit({ action: "trip.narrated", actorId: user.id });
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
  canManage: boolean; // el usuario puede editar/borrar esta hoja
  ownerName: string | null;
  data: unknown;
};

/** Confirma y guarda una hoja de ruta del vendedor. */
export async function saveTripAction(input: {
  name: string;
  totalKm: number;
  data: unknown;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireActiveUser();
  // Guardar es escritura: los roles de solo consulta no crean hojas.
  if (!canCreateTrips(user)) {
    return { ok: false, error: "Tu rol es de consulta: no puede guardar hojas de ruta." };
  }
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
    await logAudit({
      action: "trip.created",
      actorId: user.id,
      targetType: "SavedTrip",
      targetId: saved.id,
      metadata: { name },
    });
    return { ok: true, id: saved.id };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "No se pudo guardar." };
  }
}

/** Edita una hoja de ruta guardada (dueño, o gerente/admin). */
export async function updateTripAction(
  id: string,
  input: { name: string; totalKm: number; data: unknown }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireActiveUser();
  const trip = await prisma.savedTrip.findUnique({ where: { id } });
  if (!trip) return { ok: false, error: "No existe." };
  if (!canManageTrip(user, trip)) {
    return { ok: false, error: "No podés editar esta hoja de ruta." };
  }
  if (!input.data || typeof input.data !== "object") {
    return { ok: false, error: "Faltan datos de la hoja de ruta." };
  }
  const name = String(input.name || "").trim().slice(0, 80) || trip.name;
  const totalKm = Number(input.totalKm);
  await prisma.savedTrip.update({
    where: { id },
    data: {
      name,
      totalKm: Number.isFinite(totalKm) ? totalKm : trip.totalKm,
      data: input.data as object,
    },
  });
  await logAudit({
    action: "trip.updated",
    actorId: user.id,
    targetType: "SavedTrip",
    targetId: id,
    metadata: { name },
  });
  return { ok: true };
}

/** Lista las hojas de ruta del vendedor (o todas, para gerente/admin). */
export async function listSavedTripsAction(): Promise<SavedTripSummary[]> {
  const user = await requireActiveUser();
  const manager = canViewAllRecords(user);
  const where = manager ? {} : { ownerId: user.id };
  const rows = await prisma.savedTrip.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  // Nombre del vendedor dueño (SavedTrip.ownerId no tiene relación formal).
  const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => !!x))];
  const owners = ownerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, o.name ?? o.email]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    totalKm: r.totalKm,
    createdAt: r.createdAt.toISOString(),
    mine: r.ownerId === user.id,
    canManage: canManageTrip(user, r),
    ownerName: r.ownerId ? ownerName.get(r.ownerId) ?? null : null,
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
  if (!canManageTrip(user, trip)) {
    return { ok: false, error: "No podés borrar esta hoja de ruta." };
  }
  await prisma.savedTrip.delete({ where: { id } });
  await logAudit({
    action: "trip.deleted",
    actorId: user.id,
    targetType: "SavedTrip",
    targetId: id,
    metadata: { name: trip.name },
  });
  return { ok: true };
}

"use client";

import { useEffect, useMemo, useState } from "react";

import { OpportunityMap, type MapPin } from "@/components/opportunity-map";
import { AssistantMessage } from "@/components/assistant-message";
import {
  planTripAction,
  narrateTripAction,
  geocodePointAction,
  placeSuggestAction,
  searchClientsAction,
  findProspectsAction,
  saveTripAction,
  updateTripAction,
  listSavedTripsAction,
  deleteSavedTripAction,
  type SavedTripSummary,
  type ClientHit,
} from "@/app/(app)/mapa/trip-actions";
import type { PlaceSuggestion } from "@/lib/geocode";
import type { TripPlan, TripWaypoint } from "@/lib/trip";
import type { CityProspects } from "@/lib/prospects";

type CustomStop = { id: string; lat: number; lng: number; label: string };

type CarProfile = { consumption: number; fuelPrice: number };
const CAR_KEY = "rc-trip-car";
const DEFAULT_CAR: CarProfile = { consumption: 8, fuelPrice: 1200 };

function loadCar(): CarProfile {
  if (typeof window === "undefined") return DEFAULT_CAR;
  try {
    const raw = window.localStorage.getItem(CAR_KEY);
    if (!raw) return DEFAULT_CAR;
    const p = JSON.parse(raw) as Partial<CarProfile>;
    return {
      consumption: Number(p.consumption) || DEFAULT_CAR.consumption,
      fuelPrice: Number(p.fuelPrice) || DEFAULT_CAR.fuelPrice,
    };
  } catch {
    return DEFAULT_CAR;
  }
}

function fmtKm(km: number): string {
  return `${km.toLocaleString("es-AR", { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}
function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
function fmtPesos(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}
function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
/** Id estable para un prospecto web (para saber si ya está en el viaje). */
function webStopId(name: string, city: string): string {
  return `web-${slug(name)}-${slug(city)}`;
}

/**
 * Buscador con autocompletado (tipo Maps) para sumar destinos.
 * Modo LUGAR: sugiere direcciones/ciudades reales de un geocodificador → el
 * usuario elige (no se adivina). Modo CLIENTE: busca clientes de la cartera.
 */
function TripSearchBox({
  allowClient,
  onAddPlace,
  onAddClient,
}: {
  allowClient: boolean;
  onAddPlace: (label: string, lat: number, lng: number) => void;
  onAddClient: (hit: ClientHit) => void;
}) {
  const [mode, setMode] = useState<"place" | "client">("place");
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [clients, setClients] = useState<ClientHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) {
      setPlaces([]);
      setClients([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      if (mode === "place") {
        const res = await placeSuggestAction(text);
        setPlaces(res);
        setClients([]);
      } else {
        const res = await searchClientsAction(text);
        setClients(res);
        setPlaces([]);
      }
      setLoading(false);
      setOpen(true);
    }, 450); // debounce: espera a que el usuario pare de tipear
    return () => clearTimeout(t);
  }, [q, mode]);

  const hasResults = mode === "place" ? places.length > 0 : clients.length > 0;

  return (
    <div className="relative">
      {allowClient && (
        <div className="mb-1.5 flex gap-1 rounded-[8px] border bg-card2 p-0.5 text-[11.5px]">
          {(["place", "client"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setQ("");
                setPlaces([]);
                setClients([]);
              }}
              className={`flex-1 rounded-[6px] px-2 py-1 font-semibold ${
                mode === m ? "bg-[var(--primary)] text-white" : "text-text2 hover:bg-hoverbg"
              }`}
            >
              {m === "place" ? "📍 Lugar" : "👤 Cliente"}
            </button>
          ))}
        </div>
      )}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hasResults && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={
          mode === "client"
            ? "Buscar cliente de tu cartera…"
            : "Dirección, ciudad o lugar…"
        }
        className="w-full rounded-[8px] border bg-panel px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary"
      />
      {loading && (
        <span className="absolute right-2.5 top-[calc(50%+2px)] h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      )}
      {open && (hasResults || (!loading && q.trim().length >= 3)) && (
        <div className="absolute left-0 right-0 top-full z-[1200] mt-1 max-h-60 overflow-y-auto rounded-[10px] border bg-card shadow-lg">
          {mode === "place" &&
            (places.length === 0 ? (
              <div className="px-3 py-2 text-[11.5px] text-muted-foreground">
                Sin coincidencias. Probá otra forma.
              </div>
            ) : (
              places.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onAddPlace(p.label, p.lat, p.lng);
                    setQ("");
                    setPlaces([]);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 border-b border-[var(--border-2)] px-3 py-2 text-left last:border-0 hover:bg-hoverbg"
                >
                  <span>📍</span>
                  <span className="min-w-0 text-[12px]">{p.label}</span>
                </button>
              ))
            ))}
          {mode === "client" &&
            (clients.length === 0 ? (
              <div className="px-3 py-2 text-[11.5px] text-muted-foreground">
                Sin clientes ubicados con ese nombre en tu cartera.
              </div>
            ) : (
              clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onAddClient(c);
                    setQ("");
                    setClients([]);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 border-b border-[var(--border-2)] px-3 py-2 text-left last:border-0 hover:bg-hoverbg"
                >
                  <span>👤</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium">{c.name}</span>
                    {c.city && <span className="block text-[11px] text-muted-foreground">{c.city}</span>}
                  </span>
                </button>
              ))
            ))}
        </div>
      )}
    </div>
  );
}

export function MapWorkspace({
  pins,
  canManage = false,
}: {
  pins: MapPin[];
  canManage?: boolean;
}) {
  const [car, setCar] = useState<CarProfile>(DEFAULT_CAR);
  const [carOpen, setCarOpen] = useState(false);
  const [origin, setOrigin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customStops, setCustomStops] = useState<CustomStop[]>([]);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [webProspects, setWebProspects] = useState<CityProspects[] | null>(null);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "geo" | "geocode" | "dest" | "plan">(null);
  const [error, setError] = useState<string | null>(null);
  const [corridorKm, setCorridorKm] = useState(10);
  const [returnMode, setReturnMode] = useState<"origin" | "point" | "none">("origin");
  const [endPoint, setEndPoint] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [showPins, setShowPins] = useState(true);
  const [savedTrips, setSavedTrips] = useState<SavedTripSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [mapTab, setMapTab] = useState<"mapa" | "ruta">("mapa");
  const [editingId, setEditingId] = useState<string | null>(null); // hoja abierta para editar
  const [tripName, setTripName] = useState("");
  const [suggestTab, setSuggestTab] = useState<"obras" | "clientes" | "web">("obras");
  const [optsOpen, setOptsOpen] = useState(false);
  const [dirty, setDirty] = useState(false); // hay cambios sin recalcular

  useEffect(() => setCar(loadCar()), []);
  useEffect(() => {
    listSavedTripsAction().then(setSavedTrips).catch(() => {});
  }, []);

  const returnLabel =
    returnMode === "origin"
      ? "vuelve al punto de salida"
      : returnMode === "point"
        ? `termina en ${endPoint?.label ?? "otro punto"}`
        : "sin vuelta (termina en la última visita)";

  function saveCar(next: CarProfile) {
    setCar(next);
    try {
      window.localStorage.setItem(CAR_KEY, JSON.stringify(next));
    } catch {
      /* localStorage no disponible */
    }
  }

  const pinById = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);

  // Sumar/sacar destinos NO borra la ruta actual: la marca "por recalcular",
  // así se pueden encadenar varias visitas y recalcular una sola vez.
  function markStale() {
    if (plan) setDirty(true);
  }

  // Limpia por completo los resultados (al reiniciar el viaje).
  function clearResults() {
    setPlan(null);
    setNarrative(null);
    setWebProspects(null);
    setWebError(null);
    setDirty(false);
    setMapTab("mapa");
    setEditingId(null);
    setTripName("");
  }

  // Prospección web OPCIONAL: busca empresas nuevas en las ciudades del viaje.
  async function buscarProspectosWeb() {
    if (!plan) return;
    setSuggestTab("web");
    const cities = [
      origin?.label,
      ...plan.stops.map((s) => s.city ?? s.name),
      ...plan.clientVisits.map((c) => c.city),
    ].filter((c): c is string => !!c && c.trim().length > 2);
    if (cities.length === 0) return;
    setSearchingWeb(true);
    setWebError(null);
    const res = await findProspectsAction(cities);
    setSearchingWeb(false);
    if (!res.ok) {
      setWebError(res.error);
      return;
    }
    setWebProspects(res.cities);
    if (res.error) setWebError(res.error);
  }

  // Sumar un prospecto de la web al viaje (geocodifica nombre + ciudad).
  async function addWebProspect(name: string, city: string) {
    setBusy("dest");
    // Intento ubicar la empresa exacta; si no (Nominatim no conoce nombres de
    // negocios), la pongo en el centro de la ciudad para no bloquear el sumar.
    let res = await geocodePointAction(`${name}, ${city}`);
    if (!res.ok) res = await geocodePointAction(city);
    setBusy(null);
    if (!res.ok) {
      setError("No pude ubicar ese prospecto en el mapa.");
      return;
    }
    markStale();
    setError(null);
    const id = webStopId(name, city);
    setCustomStops((prev) =>
      prev.some((s) => s.id === id) ? prev : [...prev, { id, lat: res.lat, lng: res.lng, label: name }]
    );
  }

  function togglePin(id: string) {
    markStale();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function useMyLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError("Tu dispositivo no comparte ubicación. Escribí una dirección.");
      return;
    }
    setBusy("geo");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Mi ubicación",
        });
        setBusy(null);
      },
      () => {
        setBusy(null);
        setError("No pude leer tu ubicación. Escribí una dirección de partida.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function removeCustom(id: string) {
    markStale();
    setCustomStops((prev) => prev.filter((c) => c.id !== id));
  }

  // Sumar un lugar elegido del autocompletado (coordenadas exactas, sin adivinar).
  function addPlaceStop(label: string, lat: number, lng: number) {
    markStale();
    setError(null);
    setCustomStops((prev) => [...prev, { id: `place-${Date.now()}`, lat, lng, label }]);
  }

  const stopCount = selectedIds.length + customStops.length;

  async function armar() {
    setError(null);
    if (!origin) {
      setError("Primero fijá desde dónde salís.");
      return;
    }
    if (stopCount === 0) {
      setError("Sumá destinos: tocá obras en el mapa o cargá una ciudad para prospectar.");
      return;
    }
    const waypoints: TripWaypoint[] = [
      ...selectedIds.map((id) => ({ kind: "opportunity" as const, id })),
      ...customStops.map((c) => ({
        kind: "custom" as const,
        id: c.id,
        lat: c.lat,
        lng: c.lng,
        label: c.label,
      })),
    ];

    if (returnMode === "point" && !endPoint) {
      setError("Fijá el punto de vuelta o cambiá la opción de regreso.");
      return;
    }
    setBusy("plan");
    const res = await planTripAction({
      origin,
      waypoints,
      returnMode,
      endPoint,
      litersPer100Km: car.consumption,
      pricePerLiter: car.fuelPrice,
      corridorKm,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const p = res.plan;
    setPlan(p);
    setDirty(false);
    setShowPins(false); // ruta limpia: se ocultan las demás obras

    // La narrativa de la IA llega en un segundo paso (la ruta ya se ve).
    setNarrating(true);
    const nar = await narrateTripAction({
      origin: p.origin.label,
      returnLabel,
      totalKm: p.totalKm,
      totalMinutes: p.totalMinutes,
      fuelCost: p.fuelCost,
      estimated: p.estimated,
      stops: p.stops.map((s) => ({
        order: s.order,
        name: s.name,
        stageName: s.stageName,
        m2Label: s.m2Label,
        legKm: s.legKm,
      })),
      leads: p.leads.map((l) => ({
        clientName: l.clientName,
        stageName: l.stageName,
        m2Label: l.m2Label,
        detourKm: l.detourKm,
      })),
      clientVisits: p.clientVisits.map((c) => ({
        name: c.name,
        city: c.city,
        segment: c.segment,
        detourKm: c.detourKm,
      })),
    });
    setNarrating(false);
    setNarrative(nar.ok ? nar.narrative : null);
  }

  function addLead(id: string) {
    markStale();
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  // Sumar al viaje un cliente de la cartera (sin obra) como parada.
  function addClientVisit(c: { id: string; name: string; lat: number; lng: number }) {
    const cid = `client-${c.id}`;
    markStale();
    setCustomStops((prev) =>
      prev.some((s) => s.id === cid)
        ? prev
        : [...prev, { id: cid, lat: c.lat, lng: c.lng, label: c.name }]
    );
  }

  function reset() {
    clearResults();
    setSelectedIds([]);
    setCustomStops([]);
    setError(null);
    setSavedMsg(null);
    setShowPins(true);
  }

  // Link de Google Maps para navegar la ruta con GPS.
  function buildMapsUrl(p: TripPlan): string {
    const fmt = (x: number, y: number) => `${x},${y}`;
    const o = fmt(p.origin.lat, p.origin.lng);
    const stops = p.stops.map((s) => fmt(s.lat, s.lng));
    let destination: string;
    let waypoints: string[];
    if (p.returnMode === "origin") {
      destination = o;
      waypoints = stops;
    } else if (p.returnMode === "point" && p.endPoint) {
      destination = fmt(p.endPoint.lat, p.endPoint.lng);
      waypoints = stops;
    } else {
      destination = stops[stops.length - 1] ?? o;
      waypoints = stops.slice(0, -1);
    }
    const params = new URLSearchParams({ api: "1", origin: o, destination, travelmode: "driving" });
    if (waypoints.length) params.set("waypoints", waypoints.slice(0, 9).join("|"));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function openInMaps() {
    if (plan) window.open(buildMapsUrl(plan), "_blank", "noopener");
  }

  type SavedWaypoint =
    | { kind: "opportunity"; id: string }
    | { kind: "custom"; id: string; lat: number; lng: number; label: string };
  type SavedData = {
    plan?: TripPlan; // plan completo pre-calculado (para abrir sin recalcular)
    waypoints?: SavedWaypoint[]; // para editar (restaura los destinos)
    mapsUrl?: string;
  };

  // Confirmar y guardar (o actualizar) la hoja de ruta. Guarda el PLAN COMPLETO
  // para poder reabrirla ya calculada, sin volver a rutear.
  async function guardar() {
    if (!plan || !origin) return;
    setSaving(true);
    setSavedMsg(null);
    setError(null);
    const data: SavedData = {
      plan: { ...plan, narrative: narrative ?? plan.narrative },
      waypoints: [
        ...selectedIds.map((id) => ({ kind: "opportunity" as const, id })),
        ...customStops.map((c) => ({
          kind: "custom" as const,
          id: c.id,
          lat: c.lat,
          lng: c.lng,
          label: c.label,
        })),
      ],
      mapsUrl: buildMapsUrl(plan),
    };
    const name =
      tripName.trim() ||
      `${origin.label} · ${plan.stops.length} visita${plan.stops.length === 1 ? "" : "s"}`;

    if (editingId) {
      const res = await updateTripAction(editingId, { name, totalKm: plan.totalKm, data });
      setSaving(false);
      if (!res.ok) return setError(res.error);
      setSavedMsg("Hoja de ruta actualizada ✓");
    } else {
      const res = await saveTripAction({ name, totalKm: plan.totalKm, data });
      setSaving(false);
      if (!res.ok) return setError(res.error);
      setEditingId(res.id);
      setSavedMsg("Hoja de ruta guardada ✓");
    }
    setTripName(name);
    setMapTab("ruta");
    listSavedTripsAction().then(setSavedTrips).catch(() => {});
  }

  // Reabrir una hoja de ruta guardada YA CALCULADA (sin recalcular).
  function reopenTrip(s: SavedTripSummary) {
    const d = s.data as SavedData & {
      origin?: { lat: number; lng: number; label: string };
      returnMode?: "origin" | "point" | "none";
      endPoint?: { lat: number; lng: number; label: string } | null;
    };
    clearResults();
    const wps = Array.isArray(d.waypoints) ? d.waypoints : [];
    setSelectedIds(wps.flatMap((w) => (w.kind === "opportunity" ? [w.id] : [])));
    setCustomStops(
      wps.flatMap((w) =>
        w.kind === "custom" ? [{ id: w.id, lat: w.lat, lng: w.lng, label: w.label }] : []
      )
    );
    if (s.canManage) {
      setEditingId(s.id);
      setTripName(s.name);
    }

    if (d.plan?.origin) {
      // Formato nuevo: mostramos el plan guardado directamente (sin rutear).
      setOrigin(d.plan.origin);
      setReturnMode(d.plan.returnMode ?? "origin");
      setEndPoint(d.plan.endPoint ?? null);
      setPlan(d.plan);
      setNarrative(d.plan.narrative || null);
      setDirty(false);
      setShowPins(false);
      setMapTab("ruta");
      setSavedMsg(null);
    } else if (d.origin) {
      // Formato anterior: restauramos los destinos; hay que recalcular una vez.
      setOrigin(d.origin);
      setReturnMode(d.returnMode ?? "origin");
      setEndPoint(d.endPoint ?? null);
      setShowPins(true);
      setSavedMsg("Ruta cargada (versión anterior) — tocá Recalcular para verla.");
    }
  }

  async function borrarTrip(id: string) {
    if (editingId === id) {
      setEditingId(null);
      setTripName("");
    }
    await deleteSavedTripAction(id);
    listSavedTripsAction().then(setSavedTrips).catch(() => {});
  }

  const orderMap = useMemo(() => {
    if (!plan) return undefined;
    const m: Record<string, number> = {};
    plan.stops.forEach((s) => (m[s.id] = s.order));
    return m;
  }, [plan]);

  const leadIds = plan?.leads.map((l) => l.id);
  const panelStyle = { height: "calc(100dvh - 240px)", minHeight: 460 };

  // Sugerencias que todavía NO están en el viaje (para que desaparezcan al sumarlas).
  const leadsToShow = (plan?.leads ?? []).filter((l) => !selectedIds.includes(l.id));
  const clientVisitsToShow = (plan?.clientVisits ?? []).filter(
    (c) => !customStops.some((s) => s.id === `client-${c.id}`)
  );

  function TabBtn({ id, label, n }: { id: "obras" | "clientes" | "web"; label: string; n?: number }) {
    const active = suggestTab === id;
    return (
      <button
        type="button"
        onClick={() => setSuggestTab(id)}
        className={`flex-1 rounded-[7px] px-2 py-1 text-[11.5px] font-semibold transition-colors ${
          active ? "bg-[var(--primary)] text-white" : "text-text2 hover:bg-hoverbg"
        }`}
      >
        {label}
        {n != null && <span className={active ? "opacity-90" : "text-muted2"}> {n}</span>}
      </button>
    );
  }

  // Hoja de ruta comercial: todo lo útil para el viajante, armado con datos que
  // ya tenemos (sin llamadas de IA extra).
  function RouteSheet() {
    if (!plan) return null;
    const stopMapUrl = (lat: number, lng: number) =>
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[20px] font-bold leading-tight">Hoja de ruta</h2>
            <p className="text-[12px] text-muted-foreground">
              Salida: <b className="text-text2">{origin?.label}</b> · {returnLabel}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={openInMaps}
              className="rounded-[8px] border px-2.5 py-1.5 text-[11.5px] font-semibold hover:border-primary hover:text-primary"
            >
              🧭 Maps
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-[8px] border px-2.5 py-1.5 text-[11.5px] font-semibold hover:border-primary hover:text-primary"
            >
              🖨 Imprimir
            </button>
          </div>
        </div>

        {/* Totales del viaje */}
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[
            { k: "Visitas", v: String(plan.stops.length) },
            { k: "Distancia", v: fmtKm(plan.totalKm) },
            { k: "Tiempo", v: fmtDur(plan.totalMinutes) },
            { k: "Combustible", v: fmtPesos(plan.fuelCost) },
          ].map((s) => (
            <div key={s.k} className="rounded-[9px] border bg-card2 px-2 py-2">
              <div className="text-[14px] font-bold leading-none">{s.v}</div>
              <div className="mt-1 text-[9.5px] uppercase tracking-wide text-muted2">{s.k}</div>
            </div>
          ))}
        </div>

        {/* Análisis comercial (IA, ya generado) */}
        {narrative && (
          <div className="mt-3 rounded-[10px] border bg-card2 p-3">
            <AssistantMessage content={narrative} />
          </div>
        )}

        {/* Especificaciones de cada visita */}
        <div className="mt-3 space-y-2">
          {plan.stops.map((s) => {
            const prospecting = s.kind === "custom";
            return (
              <div key={s.id} className="rounded-[10px] border bg-panel p-3">
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{ background: "var(--primary)" }}
                  >
                    {s.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[14px] font-semibold">{s.name}</span>
                      {s.stageName && (
                        <span className="rounded-full bg-chip px-2 py-0.5 text-[10.5px] font-medium text-text2">
                          {s.stageName}
                        </span>
                      )}
                    </div>
                    {s.title && !prospecting && (
                      <div className="text-[12px] text-text2">{s.title}</div>
                    )}
                    {/* Datos comerciales */}
                    <div className="mt-1.5 space-y-0.5 text-[12px] text-muted-foreground">
                      {(s.m2Label || s.amountLabel) && (
                        <div>
                          {s.m2Label ? <b className="text-text2">{s.m2Label}</b> : null}
                          {s.m2Label && s.amountLabel ? " · " : ""}
                          {s.amountLabel ? (
                            <b className="text-text2">{s.amountLabel}</b>
                          ) : null}
                        </div>
                      )}
                      {s.address && (
                        <div>
                          📍 {s.address}
                          {s.city && !s.address.includes(s.city) ? `, ${s.city}` : ""}
                        </div>
                      )}
                      {s.contactName && <div>👤 {s.contactName}</div>}
                      {s.phone && (
                        <div>
                          📞{" "}
                          <a href={`tel:${s.phone}`} className="text-primary underline">
                            {s.phone}
                          </a>
                        </div>
                      )}
                      {s.notes && <div className="italic">📝 {s.notes}</div>}
                      {prospecting && (
                        <div className="italic">Prospección — cliente potencial a visitar.</div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] font-semibold text-text2">{fmtKm(s.legKm)}</div>
                    <a
                      href={stopMapUrl(s.lat, s.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary underline"
                      title="Ir a esta parada"
                    >
                      ir →
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Km entre paradas por ruta de manejo. Tocá 🧭 Maps arriba para navegar el
          viaje completo con GPS, o &quot;ir →&quot; en cada visita.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Mapa / Hoja de ruta */}
      <div
        className="relative order-2 overflow-hidden rounded-[12px] border lg:order-1"
        style={panelStyle}
      >
        {/* Pestañas del sector: mapa o hoja de ruta */}
        {plan && (
          <div className="absolute left-2 top-2 z-[1001] flex gap-1 rounded-[9px] border bg-card/95 p-0.5 shadow-md backdrop-blur">
            <button
              type="button"
              onClick={() => setMapTab("mapa")}
              className={`rounded-[7px] px-3 py-1 text-[12px] font-semibold ${
                mapTab === "mapa" ? "bg-[var(--primary)] text-white" : "text-text2 hover:bg-hoverbg"
              }`}
            >
              🗺 Mapa
            </button>
            <button
              type="button"
              onClick={() => setMapTab("ruta")}
              className={`rounded-[7px] px-3 py-1 text-[12px] font-semibold ${
                mapTab === "ruta" ? "bg-[var(--primary)] text-white" : "text-text2 hover:bg-hoverbg"
              }`}
            >
              📋 Hoja de ruta
            </button>
          </div>
        )}
        {pins.length === 0 ? (
          <div className="flex h-full items-center justify-center bg-panel px-6 text-center text-sm text-muted-foreground">
            Sin obras ubicadas todavía. Cargá la dirección de la obra en cada
            oportunidad y el pin aparece solo.
          </div>
        ) : (
          <OpportunityMap
            pins={pins}
            onTogglePin={togglePin}
            selectedIds={selectedIds}
            orderMap={orderMap}
            leadIds={leadIds}
            route={plan?.polyline}
            origin={origin}
            showPins={showPins}
            customStops={customStops}
            clientPins={clientVisitsToShow.map((c) => ({
              id: c.id,
              lat: c.lat,
              lng: c.lng,
              name: c.name,
            }))}
          />
        )}
        {pins.length > 0 && mapTab === "mapa" && (
          <button
            type="button"
            onClick={() => setShowPins((v) => !v)}
            className="pointer-events-auto absolute bottom-3 right-3 z-[1000] rounded-full border bg-card/95 px-3 py-1.5 text-[12px] font-medium shadow-md backdrop-blur hover:bg-hoverbg"
            title="Mostrar u ocultar las obras de la cartera"
          >
            {showPins ? "◉ Ocultar obras" : "○ Ver obras"}
          </button>
        )}

        {/* Overlay: hoja de ruta (el mapa queda montado debajo) */}
        {mapTab === "ruta" && plan && (
          <div className="absolute inset-0 z-[900] overflow-y-auto bg-panel px-4 pb-4 pt-14">
            <RouteSheet />
          </div>
        )}
      </div>

      {/* Panel de viaje: encabezado fijo · cuerpo con scroll · footer fijo */}
      <aside
        className="order-1 flex flex-col overflow-hidden rounded-[12px] border bg-card lg:order-2"
        style={panelStyle}
      >
        {/* Encabezado: resumen del viaje siempre a la vista */}
        <div className="shrink-0 border-b px-4 py-2.5">
          {plan ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[16px] font-bold leading-none">{fmtKm(plan.totalKm)}</span>
                <span className="text-[12px] text-muted-foreground">
                  · {fmtDur(plan.totalMinutes)} · {fmtPesos(plan.fuelCost)}
                </span>
              </div>
              {dirty && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
                  sin recalcular
                </span>
              )}
            </div>
          ) : (
            <div>
              <h2 className="text-[14px] font-semibold leading-tight">Planificar viaje</h2>
              <p className="text-[11.5px] text-muted-foreground">
                Fijá el origen, sumá destinos y armá la hoja de ruta.
              </p>
            </div>
          )}
        </div>

        {/* Cuerpo con scroll propio (el mapa queda fijo) */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Salida: GPS o buscador con autocompletado */}
          <div className="flex items-start gap-1.5">
            <button
              type="button"
              onClick={useMyLocation}
              disabled={busy === "geo"}
              className="mt-[26px] shrink-0 rounded-[8px] border px-2 py-1.5 text-[11.5px] font-medium hover:bg-hoverbg disabled:opacity-50"
              title="Usar mi ubicación GPS"
            >
              {busy === "geo" ? "…" : "◉ GPS"}
            </button>
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted2">
                Salida
              </div>
              <TripSearchBox
                allowClient={false}
                onAddPlace={(label, lat, lng) => {
                  setOrigin({ lat, lng, label });
                  markStale();
                }}
                onAddClient={() => {}}
              />
            </div>
          </div>
          {origin && (
            <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-text2">
              <span className="text-primary">◉</span>
              <span className="min-w-0 truncate">Salís de: {origin.label}</span>
            </div>
          )}

          {/* Sumar destino: autocompletado de lugares o cliente de la cartera */}
          <div className="mt-2.5">
            <TripSearchBox
              allowClient
              onAddPlace={addPlaceStop}
              onAddClient={(c) =>
                addClientVisit({ id: c.id, name: c.name, lat: c.lat, lng: c.lng })
              }
            />
          </div>

          {/* Chips de destinos elegidos */}
          {stopCount === 0 ? (
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              Tocá obras en el mapa, o cargá una ciudad para prospectar.
            </p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {selectedIds.map((id) => {
                const p = pinById.get(id);
                if (!p) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => togglePin(id)}
                    className="group flex items-center gap-1 rounded-full border bg-panel px-2 py-0.5 text-[11.5px] hover:border-primary"
                    title="Sacar del viaje"
                  >
                    {orderMap?.[id] != null && !dirty && (
                      <span className="font-bold text-primary">{orderMap[id]}.</span>
                    )}
                    <span className="max-w-[130px] truncate">{p.clientName}</span>
                    <span className="text-muted2 group-hover:text-primary">✕</span>
                  </button>
                );
              })}
              {customStops.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => removeCustom(c.id)}
                  className="group flex items-center gap-1 rounded-full border border-dashed bg-panel px-2 py-0.5 text-[11.5px] hover:border-primary"
                  title="Sacar del viaje"
                >
                  {orderMap?.[c.id] != null && !dirty && (
                    <span className="font-bold text-primary">{orderMap[c.id]}.</span>
                  )}
                  <span>📍</span>
                  <span className="max-w-[120px] truncate">{c.label}</span>
                  <span className="text-muted2 group-hover:text-primary">✕</span>
                </button>
              ))}
            </div>
          )}

          {/* Opciones (colapsables) */}
          <button
            type="button"
            onClick={() => setOptsOpen((v) => !v)}
            className="mt-2.5 flex w-full items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted2"
          >
            <span>
              ⚙︎ fin:{" "}
              {returnMode === "origin"
                ? "vuelvo a la salida"
                : returnMode === "point"
                  ? "en otro lugar"
                  : "última visita"}{" "}
              · corredor {corridorKm} km · 🚗 {car.consumption}L
            </span>
            <span>{optsOpen ? "▲" : "▼"}</span>
          </button>
          {optsOpen && (
            <div className="mt-2 space-y-2 rounded-[8px] border bg-card2 p-2.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
                <label className="flex items-center gap-1.5">
                  El viaje termina
                  <select
                    value={returnMode}
                    onChange={(e) => {
                      setReturnMode(e.target.value as "origin" | "point" | "none");
                      markStale();
                    }}
                    className="rounded-[6px] border bg-panel px-1.5 py-1 outline-none"
                  >
                    <option value="origin">Vuelvo a la salida</option>
                    <option value="point">En otro lugar</option>
                    <option value="none">En la última visita</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  Sugerencias a
                  <select
                    value={corridorKm}
                    onChange={(e) => {
                      setCorridorKm(Number(e.target.value));
                      markStale();
                    }}
                    className="rounded-[6px] border bg-panel px-1.5 py-1 outline-none"
                  >
                    <option value={5}>5 km</option>
                    <option value={10}>10 km</option>
                    <option value={20}>20 km</option>
                  </select>
                </label>
              </div>

              {returnMode === "point" && (
                <div>
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    ¿Dónde terminás el viaje?
                  </div>
                  <TripSearchBox
                    allowClient={false}
                    onAddPlace={(label, lat, lng) => {
                      setEndPoint({ lat, lng, label });
                      markStale();
                    }}
                    onAddClient={() => {}}
                  />
                  {endPoint && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-text2">
                      <span className="text-primary">◍</span>
                      <span className="min-w-0 truncate">Termina en: {endPoint.label}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-muted-foreground">
                  Consumo (L/100km)
                  <input
                    type="number"
                    min={2}
                    max={40}
                    step={0.5}
                    value={car.consumption}
                    onChange={(e) => saveCar({ ...car, consumption: Number(e.target.value) })}
                    className="mt-0.5 w-full rounded-[8px] border bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-primary"
                  />
                </label>
                <label className="text-[11px] text-muted-foreground">
                  Precio nafta ($/L)
                  <input
                    type="number"
                    min={1}
                    step={50}
                    value={car.fuelPrice}
                    onChange={(e) => saveCar({ ...car, fuelPrice: Number(e.target.value) })}
                    className="mt-0.5 w-full rounded-[8px] border bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-primary"
                  />
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-2.5 rounded-[8px] border border-primary/40 bg-primary/5 px-3 py-2 text-[12px] text-primary">
              {error}
            </div>
          )}

          {/* EN EL CAMINO — sugerencias para sumar visitas (pestañas compactas) */}
          {plan && (
            <div className="mt-3 border-t pt-3">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted2">
                Para sumar en el camino
              </div>
              <div className="mt-1.5 flex gap-1 rounded-[9px] border bg-card2 p-0.5">
                <TabBtn id="obras" label="Obras" n={leadsToShow.length} />
                <TabBtn id="clientes" label="Clientes" n={clientVisitsToShow.length} />
                <TabBtn id="web" label="🌐 Web" />
              </div>

              <div className="mt-2 space-y-1.5">
                {suggestTab === "obras" &&
                  (leadsToShow.length === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      Sin obras del pipeline cerca de la ruta.
                    </p>
                  ) : (
                    leadsToShow.map((l) => (
                      <div
                        key={l.id}
                        className="flex items-center justify-between gap-2 rounded-[8px] border bg-panel px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-medium">{l.clientName}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {l.stageName}
                            {l.m2Label ? ` · ${l.m2Label}` : ""} · a {fmtKm(l.detourKm)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addLead(l.id)}
                          className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium hover:border-primary hover:text-primary"
                        >
                          + Sumar
                        </button>
                      </div>
                    ))
                  ))}

                {suggestTab === "clientes" &&
                  (clientVisitsToShow.length === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      Sin clientes de tu cartera (sin obra) cerca de la ruta.
                    </p>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted-foreground">
                        De tu cartera, para visitar y reactivar aunque no tengan obra cargada.
                      </p>
                      {clientVisitsToShow.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-2 rounded-[8px] border bg-panel px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[12.5px] font-medium">{c.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {[c.segment, c.city].filter(Boolean).join(" · ")}
                              {c.segment || c.city ? " · " : ""}a {fmtKm(c.detourKm)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              addClientVisit({ id: c.id, name: c.name, lat: c.lat, lng: c.lng })
                            }
                            className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium hover:border-primary hover:text-primary"
                          >
                            + Sumar
                          </button>
                        </div>
                      ))}
                    </>
                  ))}

                {suggestTab === "web" &&
                  (!webProspects ? (
                    <>
                      <button
                        type="button"
                        onClick={buscarProspectosWeb}
                        disabled={searchingWeb}
                        className="w-full rounded-[9px] border border-dashed px-3 py-2 text-[12.5px] font-semibold hover:border-primary hover:text-primary disabled:opacity-60"
                      >
                        {searchingWeb ? "Buscando en la web…" : "🌐 Buscar empresas nuevas en la zona"}
                      </button>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Busca en la web sobre tu ruta. Se cachea por ciudad para no repetir costo.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted-foreground">
                        Sugerencias de la web — validá antes de visitar.
                      </p>
                      {webProspects.map((cp) => (
                        <div key={cp.city}>
                          <div className="mt-1 text-[11px] font-semibold text-text2">
                            {cp.city}
                            {cp.cached && (
                              <span className="ml-1 text-[10px] font-normal text-muted2">
                                (de caché)
                              </span>
                            )}
                          </div>
                          {(() => {
                            const visibles = cp.prospects.filter(
                              (p) => !customStops.some((s) => s.id === webStopId(p.name, cp.city))
                            );
                            if (cp.prospects.length === 0)
                              return (
                                <p className="text-[11px] text-muted-foreground">Sin resultados.</p>
                              );
                            if (visibles.length === 0)
                              return (
                                <p className="text-[11px] text-muted-foreground">
                                  Todos sumados al viaje ✓
                                </p>
                              );
                            return visibles.map((p, i) => (
                              <div
                                key={i}
                                className="mt-1 flex items-start justify-between gap-2 rounded-[8px] border bg-panel px-2.5 py-1.5"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-[12.5px] font-medium">{p.name}</div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {p.segment ? `${p.segment} · ` : ""}
                                    {p.reason}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => addWebProspect(p.name, cp.city)}
                                  className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium hover:border-primary hover:text-primary"
                                >
                                  + Sumar
                                </button>
                              </div>
                            ));
                          })()}
                        </div>
                      ))}
                      {webError && <p className="mt-1 text-[11px] text-primary">{webError}</p>}
                    </>
                  ))}
              </div>
            </div>
          )}

          {/* Hoja de ruta redactada */}
          {plan && (
            <div className="mt-3 border-t pt-3">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted2">
                Hoja de ruta
              </div>
              <div className="mt-1.5">
                {narrating ? (
                  <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Redactando…
                  </div>
                ) : narrative ? (
                  <AssistantMessage content={narrative} />
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    El recorrido y los números están listos arriba.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Hojas de ruta guardadas */}
          {savedTrips.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted2">
                Hojas de ruta guardadas
                {canManage && <span className="ml-1 font-normal normal-case text-muted2">(todas)</span>}
              </div>
              <div className="mt-1.5 space-y-1.5">
                {savedTrips.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between gap-2 rounded-[8px] border bg-panel px-2.5 py-1.5 ${
                      editingId === t.id ? "border-primary" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtKm(t.totalKm)} ·{" "}
                        {new Date(t.createdAt).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                        {!t.mine && t.ownerName ? ` · ${t.ownerName}` : ""}
                        {editingId === t.id ? " · editando" : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {(t.data as { mapsUrl?: string })?.mapsUrl && (
                        <a
                          href={(t.data as { mapsUrl?: string }).mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border px-2 py-0.5 text-[11px] font-medium hover:border-primary hover:text-primary"
                          title="Abrir en Google Maps"
                        >
                          🧭
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => reopenTrip(t)}
                        className="rounded-full border px-2 py-0.5 text-[11px] font-medium hover:border-primary hover:text-primary"
                        title={t.canManage ? "Abrir para ver o editar" : "Abrir (solo lectura)"}
                      >
                        {t.canManage ? "Abrir / editar" : "Abrir"}
                      </button>
                      {t.canManage && (
                        <button
                          type="button"
                          onClick={() => borrarTrip(t.id)}
                          className="rounded-full border px-1.5 py-0.5 text-[11px] text-muted2 hover:border-primary hover:text-primary"
                          title="Borrar"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer fijo: acciones siempre a mano */}
        <div className="shrink-0 space-y-2 border-t px-4 py-3">
          {savedMsg && (
            <div className="rounded-[8px] border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-[11.5px] font-medium text-green-600 dark:text-green-400">
              {savedMsg}
            </div>
          )}
          {plan && (
            <>
              <input
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                placeholder="Nombre de la hoja de ruta (opcional)"
                className="w-full rounded-[8px] border bg-panel px-2.5 py-1.5 text-[12px] outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={openInMaps}
                  className="flex-1 rounded-[9px] border px-3 py-2 text-[12.5px] font-semibold hover:border-primary hover:text-primary"
                  title="Abrir la ruta en Google Maps para navegar con GPS"
                >
                  🧭 Abrir en Maps
                </button>
                <button
                  type="button"
                  onClick={guardar}
                  disabled={saving || dirty}
                  className="flex-1 rounded-[9px] border px-3 py-2 text-[12.5px] font-semibold hover:border-primary hover:text-primary disabled:opacity-50"
                  title={dirty ? "Recalculá antes de guardar" : "Confirmar y guardar la hoja de ruta"}
                >
                  {saving
                    ? "Guardando…"
                    : editingId
                      ? "✓ Guardar cambios"
                      : "✓ Confirmar y guardar"}
                </button>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={armar}
              disabled={busy === "plan"}
              className={`flex-1 rounded-[9px] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60 ${
                plan && !dirty ? "bg-muted2" : "bg-[var(--primary)]"
              }`}
            >
              {busy === "plan"
                ? "Armando…"
                : !plan
                  ? "✦ Armar hoja de ruta"
                  : dirty
                    ? `↻ Recalcular (${stopCount})`
                    : "↻ Recalcular"}
            </button>
            {(stopCount > 0 || plan) && (
              <button
                type="button"
                onClick={reset}
                className="rounded-[9px] border px-3 py-2 text-[12px] font-medium hover:bg-hoverbg"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

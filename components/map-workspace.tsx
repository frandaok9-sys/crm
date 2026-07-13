"use client";

import { useEffect, useMemo, useState } from "react";

import { OpportunityMap, type MapPin } from "@/components/opportunity-map";
import { AssistantMessage } from "@/components/assistant-message";
import {
  planTripAction,
  narrateTripAction,
  geocodePointAction,
  findProspectsAction,
} from "@/app/(app)/mapa/trip-actions";
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

export function MapWorkspace({ pins }: { pins: MapPin[] }) {
  const [car, setCar] = useState<CarProfile>(DEFAULT_CAR);
  const [carOpen, setCarOpen] = useState(false);
  const [origin, setOrigin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [address, setAddress] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customStops, setCustomStops] = useState<CustomStop[]>([]);
  const [destInput, setDestInput] = useState("");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [webProspects, setWebProspects] = useState<CityProspects[] | null>(null);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "geo" | "geocode" | "dest" | "plan">(null);
  const [error, setError] = useState<string | null>(null);
  const [corridorKm, setCorridorKm] = useState(10);
  const [roundTrip, setRoundTrip] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [suggestTab, setSuggestTab] = useState<"obras" | "clientes" | "web">("obras");
  const [optsOpen, setOptsOpen] = useState(false);
  const [dirty, setDirty] = useState(false); // hay cambios sin recalcular

  useEffect(() => setCar(loadCar()), []);

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
    const res = await geocodePointAction(`${name}, ${city}`);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    markStale();
    setCustomStops((prev) => [
      ...prev,
      { id: `web-${Date.now()}`, lat: res.lat, lng: res.lng, label: name },
    ]);
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

  async function useAddress() {
    setError(null);
    if (address.trim().length < 3) return;
    setBusy("geocode");
    const res = await geocodePointAction(address);
    setBusy(null);
    if (res.ok) setOrigin({ lat: res.lat, lng: res.lng, label: res.label });
    else setError(res.error);
  }

  // Sumar un destino de prospección (una dirección o ciudad).
  async function addDestination() {
    setError(null);
    if (destInput.trim().length < 3) return;
    setBusy("dest");
    const res = await geocodePointAction(destInput);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    markStale();
    setCustomStops((prev) => [
      ...prev,
      { id: `custom-${Date.now()}`, lat: res.lat, lng: res.lng, label: res.label },
    ]);
    setDestInput("");
  }

  function removeCustom(id: string) {
    markStale();
    setCustomStops((prev) => prev.filter((c) => c.id !== id));
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

    setBusy("plan");
    const res = await planTripAction({
      origin,
      waypoints,
      roundTrip,
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
      roundTrip: p.roundTrip,
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
    setShowPins(true);
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

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Mapa */}
      <div
        className="relative order-2 overflow-hidden rounded-[12px] border lg:order-1"
        style={panelStyle}
      >
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
        {pins.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPins((v) => !v)}
            className="pointer-events-auto absolute bottom-3 right-3 z-[1000] rounded-full border bg-card/95 px-3 py-1.5 text-[12px] font-medium shadow-md backdrop-blur hover:bg-hoverbg"
            title="Mostrar u ocultar las obras de la cartera"
          >
            {showPins ? "◉ Ocultar obras" : "○ Ver obras"}
          </button>
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
          {/* Origen */}
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted2">
              Salida
            </span>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={busy === "geo"}
              className="shrink-0 rounded-[8px] border px-2 py-1 text-[11.5px] font-medium hover:bg-hoverbg disabled:opacity-50"
              title="Usar mi ubicación GPS"
            >
              {busy === "geo" ? "…" : "◉ GPS"}
            </button>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && useAddress()}
              placeholder="dirección / ciudad"
              className="min-w-0 flex-1 rounded-[8px] border bg-panel px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={useAddress}
              disabled={busy === "geocode" || address.trim().length < 3}
              className="shrink-0 rounded-[8px] border px-2 py-1.5 text-[11.5px] font-medium hover:bg-hoverbg disabled:opacity-50"
            >
              {busy === "geocode" ? "…" : "OK"}
            </button>
          </div>
          {origin && (
            <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-text2">
              <span className="text-primary">◉</span>
              <span className="min-w-0 truncate">{origin.label}</span>
            </div>
          )}

          {/* Sumar destino por dirección/ciudad */}
          <div className="mt-2.5 flex gap-1.5">
            <input
              value={destInput}
              onChange={(e) => setDestInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDestination()}
              placeholder="Sumar destino: dirección o ciudad"
              className="min-w-0 flex-1 rounded-[8px] border bg-panel px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={addDestination}
              disabled={busy === "dest" || destInput.trim().length < 3}
              className="shrink-0 rounded-[8px] border px-2.5 py-1.5 text-[12px] font-medium hover:bg-hoverbg disabled:opacity-50"
            >
              {busy === "dest" ? "…" : "+ Sumar"}
            </button>
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
              ⚙︎ {roundTrip ? "ida y vuelta" : "solo ida"} · corredor {corridorKm} km · 🚗{" "}
              {car.consumption}L
            </span>
            <span>{optsOpen ? "▲" : "▼"}</span>
          </button>
          {optsOpen && (
            <div className="mt-2 space-y-2 rounded-[8px] border bg-card2 p-2.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={roundTrip}
                    onChange={(e) => {
                      setRoundTrip(e.target.checked);
                      markStale();
                    }}
                    className="accent-[var(--primary)]"
                  />
                  Volver al inicio
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
                          {cp.prospects.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">Sin resultados.</p>
                          ) : (
                            cp.prospects.map((p, i) => (
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
                            ))
                          )}
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
        </div>

        {/* Footer fijo: acción primaria siempre a mano */}
        <div className="shrink-0 border-t px-4 py-3">
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

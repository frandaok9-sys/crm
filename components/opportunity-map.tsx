"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  Map as LeafletMap,
  LayerGroup,
  TileLayer,
  Polyline,
} from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPin = {
  id: string;
  title: string;
  clientName: string;
  m2Label: string | null;
  amountLabel: string | null;
  stageName: string;
  stageHex: string;
  ownerName: string;
  ownerTint: string;
  lat: number;
  lng: number;
};

export type MapOrigin = { lat: number; lng: number; label: string };

type MapProps = {
  pins: MapPin[];
  /** Modo viaje: si se pasa, tocar un pin lo agrega/saca del viaje. */
  onTogglePin?: (id: string) => void;
  selectedIds?: string[];
  /** Nº de parada por id (cuando ya se armó la hoja de ruta). */
  orderMap?: Record<string, number>;
  leadIds?: string[];
  route?: [number, number][];
  origin?: MapOrigin | null;
};

const AR_CENTER: [number, number] = [-38.5, -64.5];
const ROUTE_COLOR = "#dc2626"; // rojo RC
const LEAD_COLOR = "#f5b301"; // dorado (lead en el camino)

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupHtml(pin: MapPin): string {
  const m2 = pin.m2Label
    ? `<span class="map-pop-chip">${escapeHtml(pin.m2Label)}</span>`
    : "";
  const amount = pin.amountLabel
    ? `<div class="map-pop-amount">${escapeHtml(pin.amountLabel)}</div>`
    : "";
  return `
    <div class="map-pop">
      <div class="map-pop-client">${escapeHtml(pin.clientName)}</div>
      <div class="map-pop-title">${escapeHtml(pin.title)}</div>
      <div class="map-pop-meta">
        <span class="map-pop-badge" style="color:${pin.stageHex};background:${pin.stageHex}29">${escapeHtml(pin.stageName)}</span>
        ${m2}
      </div>
      ${amount}
      <div class="map-pop-owner">
        <span class="map-pop-dot" style="background:${pin.ownerTint}"></span>
        ${escapeHtml(pin.ownerName)}
      </div>
      <a class="map-pop-link" href="/oportunidades/${pin.id}">Ver oportunidad →</a>
    </div>`;
}

export function OpportunityMap({
  pins,
  onTogglePin,
  selectedIds,
  orderMap,
  leadIds,
  route,
  origin,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const routeRef = useRef<LayerGroup | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const didFitRef = useRef(false);
  const router = useRouter();

  const tripMode = !!onTogglePin;

  // "Tiempo real" liviano: re-consulta cada 60s. Se pausa en modo viaje para no
  // reencuadrar el mapa mientras el vendedor arma su recorrido.
  useEffect(() => {
    const active = (selectedIds?.length ?? 0) > 0 || (route?.length ?? 0) > 0;
    if (active) return;
    const timer = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(timer);
  }, [router, selectedIds, route]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        const map = L.map(containerRef.current).setView(AR_CENTER, 4);
        mapRef.current = map;

        const isDark = () => document.documentElement.classList.contains("dark");
        const makeTiles = () =>
          L.tileLayer(
            isDark()
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
            { attribution: "&copy; OpenStreetMap &copy; CARTO", maxZoom: 19 }
          );
        tileRef.current = makeTiles().addTo(map);

        observerRef.current = new MutationObserver(() => {
          tileRef.current?.remove();
          tileRef.current = makeTiles().addTo(map);
        });
        observerRef.current.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });

        routeRef.current = L.layerGroup().addTo(map);
        layerRef.current = L.layerGroup().addTo(map);

        map.whenReady(() => map.invalidateSize());
        setTimeout(() => map.invalidateSize(), 200);
      }

      const map = mapRef.current!;
      const selected = new Set(selectedIds ?? []);
      const leads = new Set(leadIds ?? []);

      // ---- Ruta + origen (capa aparte) --------------------------------------
      const routeLayer = routeRef.current!;
      routeLayer.clearLayers();
      if (route && route.length > 1) {
        L.polyline(route, {
          color: ROUTE_COLOR,
          weight: 5,
          opacity: 0.85,
          lineJoin: "round",
        }).addTo(routeLayer);
      }
      if (origin) {
        L.marker([origin.lat, origin.lng], {
          icon: L.divIcon({
            className: "trip-marker",
            html: `<div class="trip-origin" title="${escapeHtml(origin.label)}">◉</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        })
          .bindTooltip(`Partida: ${escapeHtml(origin.label)}`, { direction: "top" })
          .addTo(routeLayer);
      }

      // ---- Pines de obras ---------------------------------------------------
      const layer = layerRef.current!;
      layer.clearLayers();
      const bounds: [number, number][] = [];
      for (const pin of pins) {
        const latlng: [number, number] = [pin.lat, pin.lng];
        bounds.push(latlng);
        const isSelected = selected.has(pin.id);
        const isLead = leads.has(pin.id);
        const order = orderMap?.[pin.id];

        let marker;
        if (order != null) {
          // Parada numerada (hoja de ruta armada).
          marker = L.marker(latlng, {
            icon: L.divIcon({
              className: "trip-marker",
              html: `<div class="trip-stop" style="background:${ROUTE_COLOR}">${order}</div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            }),
          });
        } else if (isLead) {
          marker = L.marker(latlng, {
            icon: L.divIcon({
              className: "trip-marker",
              html: `<div class="trip-lead" style="border-color:${LEAD_COLOR};color:${LEAD_COLOR}">★</div>`,
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            }),
          });
        } else {
          marker = L.circleMarker(latlng, {
            radius: isSelected ? 11 : 9,
            fillColor: pin.ownerTint,
            fillOpacity: isSelected ? 1 : tripMode ? 0.55 : 0.95,
            color: isSelected ? ROUTE_COLOR : pin.stageHex,
            weight: isSelected ? 4 : 3,
            opacity: 1,
          });
        }

        const m2 = pin.m2Label ? ` · ${pin.m2Label}` : "";
        marker.bindTooltip(`${pin.clientName} — ${pin.stageName}${m2}`, {
          direction: "top",
          offset: [0, -8],
        });

        if (tripMode) {
          marker.on("click", () => onTogglePin!(pin.id));
        } else {
          marker.bindPopup(popupHtml(pin), { minWidth: 200 });
        }
        marker.addTo(layer);
      }

      // ---- Encuadre ---------------------------------------------------------
      if (route && route.length > 1) {
        map.fitBounds(route as [number, number][], { padding: [50, 50] });
      } else if (!didFitRef.current && bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
        didFitRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pins, selectedIds, orderMap, leadIds, route, origin, onTogglePin, tripMode]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      routeRef.current = null;
      tileRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  Map as LeafletMap,
  LayerGroup,
  TileLayer,
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

const AR_CENTER: [number, number] = [-38.5, -64.5];

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

export function OpportunityMap({ pins }: { pins: MapPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const router = useRouter();

  // "Tiempo real" liviano: re-consulta los datos cada 60 segundos.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        const map = L.map(containerRef.current).setView(AR_CENTER, 4);
        mapRef.current = map;

        const isDark = () =>
          document.documentElement.classList.contains("dark");
        const makeTiles = () =>
          L.tileLayer(
            isDark()
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
            {
              attribution: "&copy; OpenStreetMap &copy; CARTO",
              maxZoom: 19,
            }
          );
        tileRef.current = makeTiles().addTo(map);

        // Si el usuario cambia de tema, cambiar los tiles del mapa.
        observerRef.current = new MutationObserver(() => {
          tileRef.current?.remove();
          tileRef.current = makeTiles().addTo(map);
        });
        observerRef.current.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });

        layerRef.current = L.layerGroup().addTo(map);

        // El contenedor puede terminar de dimensionarse después del montaje:
        // recalcular el tamaño evita el mapa en negro (tiles sin cargar).
        map.whenReady(() => map.invalidateSize());
        setTimeout(() => map.invalidateSize(), 200);
      }

      // (Re)dibujar los pines.
      const layer = layerRef.current!;
      layer.clearLayers();
      const bounds: [number, number][] = [];
      for (const pin of pins) {
        const latlng: [number, number] = [pin.lat, pin.lng];
        bounds.push(latlng);
        const marker = L.circleMarker(latlng, {
          radius: 9,
          fillColor: pin.ownerTint, // relleno = vendedor
          fillOpacity: 0.95,
          color: pin.stageHex, // anillo = etapa
          weight: 3,
          opacity: 1,
        });
        marker.bindTooltip(pin.clientName, {
          direction: "top",
          offset: [0, -8],
        });
        marker.bindPopup(popupHtml(pin), { minWidth: 200 });
        marker.addTo(layer);
      }
      if (bounds.length > 0) {
        mapRef.current!.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pins]);

  // Limpieza al desmontar la página.
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}

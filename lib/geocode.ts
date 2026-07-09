import { prisma } from "@/lib/prisma";
import { GeocodeStatus } from "@/lib/generated/prisma/enums";

/**
 * Geocodificación de obras vía Nominatim (OpenStreetMap). Gratis; su política
 * exige identificar la app (User-Agent) y ≤1 request/segundo — volumen de
 * sobra para el alta manual de oportunidades.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "RC-CRM/1.0 (crm-rc-pisos; frandaok9@gmail.com)";

export type GeoPoint = { lat: string; lng: string; display: string };

/** Convierte una dirección de texto en coordenadas (limitado a Argentina). */
export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=ar&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const results = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;
  const hit = results[0];
  if (!hit) return null;
  return {
    lat: Number(hit.lat).toFixed(6),
    lng: Number(hit.lon).toFixed(6),
    display: hit.display_name,
  };
}

/**
 * Geocodifica una oportunidad y guarda el resultado. Nunca lanza: un fallo
 * queda como FAILED y no rompe el guardado que la disparó.
 * `force` re-geocodifica aunque el pin sea MANUAL (usar cuando la dirección cambió).
 */
export async function geocodeOpportunity(
  opportunityId: string,
  options: { force?: boolean } = {}
): Promise<void> {
  try {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        client: { select: { address: true, city: true, province: true } },
      },
    });
    if (!opportunity) return;
    if (opportunity.geocodeStatus === GeocodeStatus.MANUAL && !options.force) {
      return; // pin fijado a mano: respetarlo
    }

    // Dirección de la obra; si no hay, ciudad/provincia del cliente.
    const parts = opportunity.siteAddress
      ? [
          opportunity.siteAddress,
          opportunity.client.city,
          opportunity.client.province,
        ]
      : [
          opportunity.client.address,
          opportunity.client.city,
          opportunity.client.province,
        ];
    const query = parts.filter(Boolean).join(", ");
    if (!query) {
      await prisma.opportunity.update({
        where: { id: opportunityId },
        data: { geocodeStatus: GeocodeStatus.FAILED, geocodedAt: new Date() },
      });
      return;
    }

    let point = await geocodeAddress(`${query}, Argentina`);
    // Reintento más laxo: solo ciudad + provincia (direcciones rurales).
    if (!point && opportunity.siteAddress) {
      const fallback = [
        opportunity.client.city,
        opportunity.client.province,
        "Argentina",
      ]
        .filter(Boolean)
        .join(", ");
      if (fallback !== "Argentina") point = await geocodeAddress(fallback);
    }

    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: point
        ? {
            latitude: point.lat,
            longitude: point.lng,
            geocodedAddress: point.display,
            geocodeStatus: GeocodeStatus.OK,
            geocodedAt: new Date(),
          }
        : { geocodeStatus: GeocodeStatus.FAILED, geocodedAt: new Date() },
    });
  } catch (error) {
    console.error("geocodeOpportunity failed:", error);
    try {
      await prisma.opportunity.update({
        where: { id: opportunityId },
        data: { geocodeStatus: GeocodeStatus.FAILED, geocodedAt: new Date() },
      });
    } catch {
      // sin conexión a la base: nada más que hacer
    }
  }
}

import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/prisma";

/**
 * Prospección web para la hoja de ruta (FUNCIÓN OPCIONAL, con costo).
 *
 * Busca en la web empresas reales en las ciudades del viaje que podrían
 * necesitar pisos industriales, para sumar prospectos nuevos al recorrido.
 *
 * Control de costo (para que sea rentable):
 * - Se dispara SOLO a pedido (botón), nunca automático.
 * - CACHÉ por ciudad (~30 días): si otro vendedor ya rastreó esa ciudad, se
 *   reutiliza sin volver a pagar búsqueda web + IA.
 * - Tope de ciudades por consulta y de resultados por ciudad; modelo económico.
 * - La IA solo sugiere; son datos SIN VERIFICAR, para validar a mano.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const CACHE_DAYS = 30;
const MAX_CITIES = 3; // tope de ciudades por consulta (control de costo)
const MAX_PER_CITY = 5;

export type WebProspect = { name: string; segment: string; reason: string };
export type CityProspects = { city: string; cached: boolean; prospects: WebProspect[] };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Extrae el bloque JSON {prospects:[...]} del texto del modelo. */
function parseProspects(text: string): WebProspect[] {
  try {
    const clean = text.replace(/```json|```/g, "");
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end < 0) return [];
    const parsed = JSON.parse(clean.slice(start, end + 1)) as {
      prospects?: unknown;
    };
    if (!Array.isArray(parsed.prospects)) return [];
    return parsed.prospects
      .filter((p): p is WebProspect => !!p && typeof (p as WebProspect).name === "string")
      .slice(0, MAX_PER_CITY)
      .map((p) => ({
        name: String(p.name).trim().slice(0, 120),
        segment: String(p.segment ?? "").trim().slice(0, 40),
        reason: String(p.reason ?? "").trim().slice(0, 220),
      }));
  } catch {
    return [];
  }
}

const SYSTEM = `Sos el prospector de RC Pisos Industriales (instala pisos industriales de hormigón pulido, epoxi y poliuretano por m², en Argentina). Buscás en la web EMPRESAS REALES ubicadas en una ciudad dada que podrían necesitar pisos industriales.

Segmentos objetivo: bodegas/vitivinícolas, frigoríficos, plantas/fábricas, agroindustria, depósitos/logística, constructoras, galpones comerciales grandes.

INSTRUCCIONES:
- Usá la búsqueda web para encontrar empresas REALES de esos rubros en la ciudad indicada. No inventes nombres.
- Devolvé como máximo 5, priorizando las que más probablemente necesiten piso industrial (naves nuevas, ampliaciones, m² grandes).
- Si no encontrás datos confiables, devolvé una lista vacía. No rellenes.
- Terminá tu respuesta SOLO con un bloque JSON, sin texto después:
{"prospects":[{"name":"Razón social","segment":"bodega|frigorífico|planta|logística|constructora|agroindustria|comercio","reason":"por qué es un buen prospecto (1 frase, dato concreto)"}]}`;

async function searchCity(client: Anthropic, city: string): Promise<WebProspect[]> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: SYSTEM,
    // Búsqueda web del lado del servidor (herramienta oficial de Anthropic).
    // max_uses=2: menos búsquedas por ciudad = menos costo.
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 2 },
    ] as unknown as Anthropic.Messages.Tool[],
    messages: [
      {
        role: "user",
        content: `Buscá empresas que podrían necesitar pisos industriales en: ${city}.`,
      },
    ],
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
  return parseProspects(text);
}

/**
 * Prospectos web para una lista de ciudades del viaje. Usa caché por ciudad.
 * Nunca lanza: ante error (p. ej. búsqueda web no habilitada) devuelve lo que
 * tenga y marca el resto vacío.
 */
export async function findWebProspects(
  cityInputs: string[]
): Promise<{ cities: CityProspects[]; error?: string }> {
  // Normalizar y deduplicar ciudades, con tope.
  const seen = new Set<string>();
  const cities: { raw: string; key: string }[] = [];
  for (const raw of cityInputs) {
    const label = raw.trim();
    if (label.length < 3) continue;
    // Clave por CIUDAD (ignora provincia/dirección tras la coma) para no
    // buscar dos veces la misma: "San Rafael" == "San Rafael, Mendoza".
    const key = norm(label.split(",")[0]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cities.push({ raw: label, key });
    if (cities.length >= MAX_CITIES) break;
  }
  if (cities.length === 0) return { cities: [] };

  const fresh = new Date(Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000);
  const cachedRows = await prisma.webProspectCache.findMany({
    where: { cityKey: { in: cities.map((c) => c.key) }, fetchedAt: { gte: fresh } },
  });
  const cache = new Map(cachedRows.map((r) => [r.cityKey, r]));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  const out: CityProspects[] = [];
  let error: string | undefined;

  for (const c of cities) {
    const hit = cache.get(c.key);
    if (hit) {
      out.push({ city: c.raw, cached: true, prospects: hit.prospects as unknown as WebProspect[] });
      continue;
    }
    if (!client) {
      error = "La búsqueda web no está configurada en el servidor.";
      continue;
    }
    try {
      const prospects = await searchCity(client, c.raw);
      await prisma.webProspectCache.upsert({
        where: { cityKey: c.key },
        create: { cityKey: c.key, city: c.raw, prospects: prospects as object },
        update: { prospects: prospects as object, fetchedAt: new Date() },
      });
      out.push({ city: c.raw, cached: false, prospects });
    } catch (e) {
      error = (e as Error).message?.includes("web_search")
        ? "La búsqueda web no está habilitada en esta cuenta de Claude."
        : "No se pudo completar la búsqueda web.";
    }
  }

  return { cities: out, error };
}

/*
 * Backfill de geolocalización de CLIENTES a escala (carteras de miles).
 *
 * Geocodifica por CIUDAD con caché: 2000 clientes suelen estar en 50-150
 * ciudades, así se hacen ~100 llamadas a Nominatim (no 2000), respetando su
 * política de uso (1 request/seg, User-Agent identificado). Precisión a nivel
 * ciudad — suficiente para sugerir visitas en un corredor de 5-20 km.
 *
 * Los clientes NUEVOS o editados se geocodifican a nivel dirección (exacto)
 * desde la app; este script es solo para poblar los que ya existen.
 *
 * Uso:  node scripts/geocode-clients-backfill.js
 * Es idempotente: solo procesa clientes sin coordenadas (no MANUAL).
 */
const { Client } = require("pg");
require("dotenv").config();

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "RC-CRM/1.0 (crm-rc-pisos; frandaok9@gmail.com)";
const DELAY_MS = 1100; // ≥1 req/seg (política de Nominatim)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || "").trim().toLowerCase();

async function geocodeCity(query) {
  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=ar&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const hits = await res.json();
  const h = hits[0];
  return h ? { lat: Number(h.lat).toFixed(6), lng: Number(h.lon).toFixed(6) } : null;
}

async function main() {
  const cs = (process.env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]*/, "");
  if (!cs) throw new Error("Falta DATABASE_URL en .env");
  const db = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { rows: pending } = await db.query(
    `SELECT id, city, province FROM "Client"
     WHERE latitude IS NULL AND "geocodeStatus" <> 'MANUAL'`
  );
  console.log(`Clientes a ubicar: ${pending.length}`);

  // Agrupar por (ciudad, provincia).
  const groups = new Map(); // key → { city, province, ids: [] }
  const noCity = [];
  for (const c of pending) {
    if (!norm(c.city)) {
      noCity.push(c.id);
      continue;
    }
    const key = `${norm(c.city)}|${norm(c.province)}`;
    if (!groups.has(key)) groups.set(key, { city: c.city, province: c.province, ids: [] });
    groups.get(key).ids.push(c.id);
  }
  console.log(`Ciudades únicas a geocodificar: ${groups.size} · sin ciudad: ${noCity.length}`);

  // Clientes sin ciudad → FAILED (no se pueden ubicar).
  if (noCity.length) {
    await db.query(
      `UPDATE "Client" SET "geocodeStatus"='FAILED', "geocodedAt"=now() WHERE id = ANY($1)`,
      [noCity]
    );
  }

  let done = 0,
    ok = 0,
    fail = 0;
  for (const { city, province, ids } of groups.values()) {
    const query = [city, province, "Argentina"].filter(Boolean).join(", ");
    let point = null;
    try {
      point = await geocodeCity(query);
    } catch (e) {
      console.error(`  error en "${query}": ${e.message}`);
    }
    if (point) {
      await db.query(
        `UPDATE "Client" SET latitude=$1, longitude=$2, "geocodeStatus"='OK', "geocodedAt"=now() WHERE id = ANY($3)`,
        [point.lat, point.lng, ids]
      );
      ok += ids.length;
    } else {
      await db.query(
        `UPDATE "Client" SET "geocodeStatus"='FAILED', "geocodedAt"=now() WHERE id = ANY($1)`,
        [ids]
      );
      fail += ids.length;
    }
    done++;
    if (done % 10 === 0 || done === groups.size) {
      console.log(`  ${done}/${groups.size} ciudades · ${ok} ubicados · ${fail} sin resultado`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Listo. Ubicados: ${ok} · sin resultado: ${fail} · sin ciudad: ${noCity.length}`);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

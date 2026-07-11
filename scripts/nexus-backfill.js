// Sincronización inicial RC → Nexus Central: empuja TODOS los clientes,
// oportunidades y presupuestos existentes a la central vía su API.
// Idempotente: usa event_id estable por entidad (re-ejecutar = skipped).
// Uso: node scripts/nexus-backfill.js
const { Client } = require("pg");
const fs = require("node:fs");
const path = require("node:path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const get = (k) => env.match(new RegExp(`${k}="([^"]+)"`))?.[1];
const DB = get("DATABASE_URL")?.replace(/([?&])sslmode=[^&]*/, "");
const URL_ = get("NEXUS_URL");
const KEY = get("NEXUS_API_KEY");
if (!DB || !URL_ || !KEY) {
  console.error("Faltan DATABASE_URL / NEXUS_URL / NEXUS_API_KEY en .env");
  process.exit(1);
}

const QUOTE_STATUS = { DRAFT: "draft", SENT: "sent", APPROVED: "approved", REJECTED: "rejected", EXPIRED: "rejected" };
const SEGMENT = { BODEGA: "Bodega / Vitivinícola", AGROINDUSTRIA: "Agroindustria", CONSTRUCTORA: "Constructora", FABRICA: "Fábrica / Planta", LOGISTICA: "Logística", COMERCIO: "Comercio", OTRO: "Otro" };

async function push(entity, eventId, data) {
  const res = await fetch(`${URL_}/api/v1/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ event_id: eventId, entity, source: "rc-backfill", data }),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok ? body.result : `ERROR ${res.status} ${body.error ?? ""}`;
}

(async () => {
  const c = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tally = { ok: 0, skipped: 0, error: 0 };
  const count = (r) => tally[r === "ok" ? "ok" : r === "skipped" ? "skipped" : "error"]++;

  const clients = (await c.query('select * from "Client" order by "createdAt"')).rows;
  for (const cl of clients) {
    count(await push("client", `backfill:client:${cl.id}`, {
      external_id: cl.id,
      name: cl.legalName,
      cuit: cl.taxId,
      zone: [cl.city, cl.province].filter(Boolean).join(", ") || null,
      industry: cl.segment ? SEGMENT[cl.segment] : cl.industry,
    }));
  }

  const opps = (await c.query(`
    select o.*, s.name as stage_name, cl."legalName", cl."taxId", cl.city, cl.province
    from "Opportunity" o
    join "Stage" s on s.id = o."stageId"
    join "Client" cl on cl.id = o."clientId"
    order by o."createdAt"`)).rows;
  for (const o of opps) {
    count(await push("opportunity", `backfill:opportunity:${o.id}`, {
      external_id: o.id,
      title: o.title,
      stage: o.stage_name,
      amount: o.amount,
      currency: o.currency,
      origin: "external",
      client: {
        external_id: o.clientId,
        name: o.legalName,
        cuit: o.taxId,
        zone: [o.city, o.province].filter(Boolean).join(", ") || null,
      },
    }));
  }

  const quotes = (await c.query('select * from "Quote" order by "createdAt"')).rows;
  for (const q of quotes) {
    count(await push("quote", `backfill:quote:${q.id}`, {
      external_id: q.id,
      code: q.version > 1 ? `${q.code} (Rev.${q.version})` : q.code,
      status: QUOTE_STATUS[q.status] ?? "draft",
      total: q.total,
      currency: q.currency,
    }));
  }

  await c.end();
  console.log(`Backfill: ${clients.length} clientes, ${opps.length} oportunidades, ${quotes.length} presupuestos`);
  console.log(`Resultado → ok: ${tally.ok} · repetidos: ${tally.skipped} · errores: ${tally.error}`);
  process.exit(tally.error > 0 ? 1 : 0);
})();

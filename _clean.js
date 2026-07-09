require("dotenv/config");
const { Client } = require("pg");
const connectionString = process.env.DATABASE_URL.replace(
  /([?&])sslmode=[^&]*(&|$)/i,
  (_m, sep, tail) => (tail === "&" ? sep : "")
);
(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  // Todas las revisiones de PRE-0002 son copias idénticas (mismo total e ítems).
  // Se conservan Rev.1 (original) y Rev.2 (borrador editable); se borra el resto.
  const res = await c.query(
    `DELETE FROM "Quote" WHERE code = 'PRE-0002' AND version >= 3`
  );
  console.log("Revisiones duplicadas eliminadas: " + res.rowCount);
  const left = await c.query(
    `SELECT code, version, status FROM "Quote" ORDER BY code, version`
  );
  console.log("Quedan:");
  for (const r of left.rows) console.log(`  ${r.code} Rev.${r.version} (${r.status})`);
  await c.end();
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });

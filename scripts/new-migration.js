// Crea una migración nueva comparando la base de datos real contra el
// schema.prisma deseado — sin usar "shadow database" (el pooler de
// Supabase no la soporta bien). Uso: npm run db:migrate -- nombre_descriptivo
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const name = process.argv[2];
if (!name) {
  console.error("Uso: npm run db:migrate -- nombre_descriptivo");
  process.exit(1);
}

const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");

const sql = execSync(
  "npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script",
  { encoding: "utf8", cwd: path.join(__dirname, "..") }
);

const meaningful = sql
  .split("\n")
  .some((line) => line.trim() && !line.trim().startsWith("--"));

if (!meaningful) {
  console.log("El schema no tiene cambios pendientes: no se creó ninguna migración.");
  process.exit(0);
}

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+/, "")
  .replace("T", "");
const dirName = `${timestamp}_${name}`;
const dirPath = path.join(migrationsDir, dirName);
fs.mkdirSync(dirPath, { recursive: true });
fs.writeFileSync(path.join(dirPath, "migration.sql"), sql);

console.log(`Migración creada: prisma/migrations/${dirName}/migration.sql`);
console.log("Revisá el SQL generado y después aplicalo con: npm run db:deploy");

import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires a driver adapter. We connect to PostgreSQL via the pg adapter.
const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error(
    "DATABASE_URL no está configurada. Agregá la cadena de conexión en el archivo .env."
  );
}

// node-postgres escalates `sslmode=require` to full CA verification, which fails
// against Supabase's pooler certificate. Strip sslmode from the URL and enable
// TLS explicitly (encrypted, without CA verification) via the adapter instead.
const connectionString = rawUrl.replace(
  /([?&])sslmode=[^&]*(&|$)/i,
  (_match, sep, tail) => (tail === "&" ? sep : "")
);

// Reuse a single PrismaClient across hot-reloads in development to avoid
// exhausting database connections. In production a fresh instance is fine.
const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ssl: { rejectUnauthorized: false },
      // En producción (Vercel) cada instancia serverless abre su propio pool
      // contra el pooler de transacciones de Supabase: con el default (10)
      // varias instancias en paralelo lo agotan. Un tope chico por instancia
      // alcanza (las consultas son cortas) y evita "too many connections".
      max: process.env.NODE_ENV === "production" ? 5 : 10,
    }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

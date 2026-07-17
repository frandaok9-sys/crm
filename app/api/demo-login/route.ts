import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { Role, UserStatus } from "@/lib/generated/prisma/enums";

const DEMO_EMAIL = "prueba@gmail.com";
const SESSION_DAYS = 7;

// Freno anti fuerza bruta: pocos intentos fallidos por IP en una ventana.
// (En serverless el mapa es por instancia — no es perfecto, pero corta los
// bombardeos; la defensa real es NO definir DEMO_PASSWORD en producción.)
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60_000;
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}

function isBlocked(ip: string): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    failedAttempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
  } else {
    entry.count++;
  }
}

/** Comparación en tiempo constante (evita adivinar la clave midiendo tiempos). */
function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Demo login: signs in the throwaway `prueba@gmail.com` user WITHOUT Google,
 * gated by the DEMO_PASSWORD env var. Creates a real database session (same
 * mechanism Auth.js uses) so the rest of the app works unchanged.
 * Delete the user and unset DEMO_PASSWORD when the demo is over.
 */
export async function POST(request: Request): Promise<Response> {
  const demoPassword = process.env.DEMO_PASSWORD;
  const loginUrl = new URL("/login", request.url);

  if (!demoPassword) {
    loginUrl.searchParams.set("demo", "disabled");
    return NextResponse.redirect(loginUrl, 303);
  }

  const ip = clientIp(request);
  if (isBlocked(ip)) {
    loginUrl.searchParams.set("demo", "error");
    return NextResponse.redirect(loginUrl, 303);
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (email !== DEMO_EMAIL || !passwordMatches(password, demoPassword)) {
    recordFailure(ip);
    await logAudit({
      action: "user.demo_login_failed",
      ipAddress: ip,
      metadata: { email },
    });
    loginUrl.searchParams.set("demo", "error");
    return NextResponse.redirect(loginUrl, 303);
  }

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      status: UserStatus.ACTIVE,
      role: Role.ADMIN,
      permissions: ROLE_DEFAULT_PERMISSIONS[Role.ADMIN],
    },
    create: {
      email: DEMO_EMAIL,
      name: "Usuario Demo",
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      permissions: ROLE_DEFAULT_PERMISSIONS[Role.ADMIN],
    },
  });

  const sessionToken = `${randomUUID()}${randomUUID()}`;
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  await logAudit({
    action: "user.demo_login",
    actorId: user.id,
    targetType: "User",
    targetId: user.id,
  });

  // Cookie name/attributes must match Auth.js v5 database sessions.
  const proto =
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(":", "");
  const secure = proto === "https";
  const cookieName = secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });
  return response;
}

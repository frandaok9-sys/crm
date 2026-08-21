import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { verifyPassword } from "@/lib/password";
import { UserStatus } from "@/lib/generated/prisma/enums";

const SESSION_DAYS = 7;

// Freno anti fuerza bruta por IP (mismo criterio que el acceso demo). En
// serverless el mapa es por instancia: no es perfecto, pero corta bombardeos;
// bcrypt además hace lenta cada verificación por diseño.
const MAX_ATTEMPTS = 6;
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

/**
 * Login con email + contraseña para usuarios SIN cuenta de Google (los crea un
 * administrador). Crea una sesión de base de datos real (el mismo mecanismo de
 * Auth.js), así el resto de la app y sus permisos funcionan sin cambios.
 * El mensaje de error es genérico a propósito: no revela si el email existe.
 */
export async function POST(request: Request): Promise<Response> {
  const loginUrl = new URL("/login", request.url);
  const fail = () => {
    loginUrl.searchParams.set("pw", "error");
    return NextResponse.redirect(loginUrl, 303);
  };

  const ip = clientIp(request);
  if (isBlocked(ip)) return fail();

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return fail();

  const user = await prisma.user.findUnique({ where: { email } });

  // Solo usuarios ACTIVOS con contraseña configurada.
  if (
    !user ||
    !user.passwordHash ||
    user.status !== UserStatus.ACTIVE ||
    !verifyPassword(password, user.passwordHash)
  ) {
    recordFailure(ip);
    await logAudit({
      action: "user.password_login_failed",
      ipAddress: ip,
      metadata: { email },
    });
    return fail();
  }

  const sessionToken = `${randomUUID()}${randomUUID()}`;
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  await logAudit({
    action: "user.login",
    actorId: user.id,
    targetType: "User",
    targetId: user.id,
    metadata: { method: "password" },
  });

  // Cookie con nombre/atributos de Auth.js v5 (sesiones de base de datos).
  const proto =
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(":", "");
  const secure = proto === "https";
  const cookieName = secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const response = NextResponse.redirect(new URL("/apps", request.url), 303);
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });
  return response;
}

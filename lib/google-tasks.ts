import { prisma } from "@/lib/prisma";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TASKS_BASE = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";

/** Thrown when the user hasn't granted Google Tasks access (needs re-login). */
export class GoogleNotConnectedError extends Error {}

/** True when the user granted the Tasks scope and we have a refresh token. */
export async function hasGoogleTasksAccess(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { refresh_token: true, scope: true },
  });
  return Boolean(account?.refresh_token && account.scope?.includes("tasks"));
}

/** Returns a valid access token for the user, refreshing it if expired. */
async function getAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) {
    throw new GoogleNotConnectedError("La cuenta de Google no está conectada.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    account.access_token &&
    account.expires_at &&
    account.expires_at - 60 > now
  ) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new GoogleNotConnectedError(
      "Falta autorización de Google. Cerrá sesión y volvé a iniciarla."
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });
  if (!res.ok) {
    throw new GoogleNotConnectedError(
      "No se pudo renovar el acceso a Google. Cerrá sesión y volvé a iniciarla."
    );
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: now + (data.expires_in ?? 3600),
    },
  });
  return data.access_token;
}

/** Creates a task in the user's default Google Tasks list. Returns its id. */
export async function createGoogleTask(
  userId: string,
  input: { title: string; notes?: string | null; due?: string | null }
): Promise<string> {
  const token = await getAccessToken(userId);
  const res = await fetch(TASKS_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      notes: input.notes ?? undefined,
      due: input.due ?? undefined,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google Tasks API ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

/** Best-effort deletion of a task in Google Tasks. */
export async function deleteGoogleTask(
  userId: string,
  taskId: string
): Promise<void> {
  const token = await getAccessToken(userId);
  await fetch(`${TASKS_BASE}/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

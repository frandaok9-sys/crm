import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { UserStatus } from "@/lib/generated/prisma/enums";

/** Returns the current session user, or null if not signed in. */
export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** Requires a signed-in user; redirects to /login otherwise. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Requires a signed-in AND active user. Pending/disabled users are sent to
 * the /pending screen. Use this to guard the application shell.
 */
export async function requireActiveUser() {
  const user = await requireUser();
  if (user.status !== UserStatus.ACTIVE) redirect("/pending");
  return user;
}

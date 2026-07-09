import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { UserStatus } from "@/lib/generated/prisma/enums";

/**
 * Returns the current session user, or null if not signed in.
 * Wrapped in React cache() so layout + page share ONE session lookup per
 * request instead of hitting the database twice.
 */
export const currentUser = cache(async () => {
  const session = await auth();
  return session?.user ?? null;
});

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

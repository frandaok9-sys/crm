import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { Role, UserStatus } from "@/lib/generated/prisma/enums";

/** Parses a comma-separated env var into a list of lowercased, trimmed values. */
function parseEmailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Central rule that decides whether an email is allowed to sign in for the
 * FIRST time, and whether it should be bootstrapped as the initial admin.
 *
 * - `INITIAL_ADMIN_EMAILS`: exact emails that become ADMIN + ACTIVE on creation.
 * - `ALLOWED_EMAIL_DOMAIN`: corporate domain (Workspace). Matching emails are
 *   created as PENDING until an admin activates them. Empty for now (Gmail mode).
 */
function evaluateEmail(email: string): {
  allowed: boolean;
  isInitialAdmin: boolean;
} {
  const initialAdmins = parseEmailList(process.env.INITIAL_ADMIN_EMAILS);
  const isInitialAdmin = initialAdmins.includes(email);

  const domain = process.env.ALLOWED_EMAIL_DOMAIN?.trim()
    .toLowerCase()
    .replace(/^@/, "");
  const domainMatches = domain ? email.endsWith(`@${domain}`) : false;

  return { allowed: isInitialAdmin || domainMatches, isInitialAdmin };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Request offline access + the Google Tasks scope so the app can
          // create task reminders on the user's behalf. `prompt: consent`
          // forces re-consent so Google returns a refresh token.
          scope:
            "openid email profile https://www.googleapis.com/auth/tasks",
          access_type: "offline",
          prompt: "consent",
          // When Workspace is configured, restrict the account chooser to the domain.
          ...(process.env.ALLOWED_EMAIL_DOMAIN
            ? { hd: process.env.ALLOWED_EMAIL_DOMAIN.replace(/^@/, "") }
            : {}),
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      // Reject unverified Google emails.
      if (
        account?.provider === "google" &&
        (profile as { email_verified?: boolean })?.email_verified === false
      ) {
        return false;
      }

      // Existing users may sign in unless they were disabled by an admin.
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return existing.status !== UserStatus.DISABLED;
      }

      // New users: only if whitelisted (initial admin) or domain matches.
      return evaluateEmail(email).allowed;
    },
    async session({ session, user }) {
      if (session.user) {
        // With the database session strategy, `user` is the full DB row,
        // which includes our custom role/status fields.
        const dbUser = user as unknown as {
          role: Role | null;
          status: UserStatus;
        };
        session.user.id = user.id;
        session.user.role = dbUser.role;
        session.user.status = dbUser.status;
      }
      return session;
    },
  },
  events: {
    // Bootstrap the very first admin so there is someone who can activate others.
    async createUser({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return;
      const bootstrapped = evaluateEmail(email).isInitialAdmin;
      if (bootstrapped) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: Role.ADMIN, status: UserStatus.ACTIVE },
        });
      }
      await logAudit({
        action: "user.created",
        actorId: user.id,
        targetType: "User",
        targetId: user.id,
        metadata: { email, bootstrappedAsAdmin: bootstrapped },
      });
    },
    async signIn({ user, account }) {
      if (user.id) {
        await logAudit({
          action: "user.login",
          actorId: user.id,
          targetType: "User",
          targetId: user.id,
        });
      }
      // Persist the latest Google tokens (access + refresh) so the app can call
      // the Tasks API later. Auth.js doesn't refresh stored tokens on re-login.
      if (account?.provider === "google") {
        await prisma.account.updateMany({
          where: {
            provider: "google",
            providerAccountId: account.providerAccountId,
          },
          data: {
            access_token: account.access_token ?? undefined,
            refresh_token: account.refresh_token ?? undefined,
            expires_at: account.expires_at ?? undefined,
            scope: account.scope ?? undefined,
            token_type: account.token_type ?? undefined,
            id_token: account.id_token ?? undefined,
          },
        });
      }
    },
  },
});

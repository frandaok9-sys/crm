import type { DefaultSession } from "next-auth";
import type { Role, UserStatus } from "@/lib/generated/prisma/enums";

// Extend the session so server code can read the user's id, role and status.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role | null;
      status: UserStatus;
    } & DefaultSession["user"];
  }
}

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { UserStatus } from "@/lib/generated/prisma/enums";
import { SignOutButton } from "@/components/sign-out-button";

export default async function PendingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.status === UserStatus.ACTIVE) redirect("/dashboard");

  const disabled = session.user.status === UserStatus.DISABLED;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm dark:bg-zinc-900">
        <h1 className="text-xl font-semibold tracking-tight">
          {disabled ? "Cuenta deshabilitada" : "Cuenta pendiente de aprobación"}
        </h1>
        <p className="mt-3 text-sm text-zinc-500">
          {disabled
            ? "Tu cuenta fue deshabilitada. Contactá a un administrador si creés que es un error."
            : "Tu cuenta fue creada y está esperando que un administrador la active y te asigne un rol. Te avisaremos cuando puedas ingresar."}
        </p>
        <p className="mt-2 text-sm text-zinc-400">{session.user.email}</p>
        <div className="mt-6 flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}

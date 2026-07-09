import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { getCompanySettings } from "@/lib/company";
import { Button } from "@/components/ui/button";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const settings = await getCompanySettings();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 p-6">
      {/* Industrial backdrop: faint blueprint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {/* Hazard-stripe accent bar */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, oklch(0.55 0.21 28) 0 18px, oklch(0.2 0.006 260) 18px 36px)",
        }}
      />

      <div className="relative w-full max-w-sm border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          {settings?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logo}
              alt={settings.tradeName ?? settings.legalName ?? "Logo"}
              className="mx-auto mb-3 h-14 w-auto"
            />
          ) : (
            <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-white">
              <span className="text-primary">RC</span> CRM
            </h1>
          )}
          <p className="font-heading text-xs uppercase tracking-[0.35em] text-zinc-500">
            Pisos Industriales
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" className="h-10 w-full uppercase tracking-wider">
            Iniciar sesión con Google
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-500">
          Acceso restringido a usuarios autorizados.
        </p>
      </div>
    </main>
  );
}

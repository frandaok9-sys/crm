import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { getCompanySettings } from "@/lib/company";
import { Button } from "@/components/ui/button";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const settings = await getCompanySettings();

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-sm rounded-xl border bg-white p-8 shadow-sm dark:bg-zinc-950">
        <div className="mb-8 text-center">
          {settings?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logo}
              alt={settings.tradeName ?? settings.legalName ?? "Logo"}
              className="mx-auto mb-2 h-14 w-auto"
            />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
          )}
          <p className="mt-2 text-sm text-zinc-500">
            Iniciá sesión para acceder al sistema.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" className="w-full">
            Iniciar sesión con Google
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-zinc-400">
          El acceso está restringido a usuarios autorizados.
        </p>
      </div>
    </main>
  );
}

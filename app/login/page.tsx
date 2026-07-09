import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-sm rounded-xl border bg-white p-8 shadow-sm dark:bg-zinc-950">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
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

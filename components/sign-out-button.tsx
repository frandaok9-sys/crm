import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton({
  appearance = "light",
}: {
  /** "dark" for the steel header, "light" for regular pages. */
  appearance?: "dark" | "light";
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      {appearance === "dark" ? (
        <Button
          type="submit"
          size="sm"
          className="border border-zinc-700 bg-transparent text-xs uppercase tracking-wider text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
        >
          Cerrar sesión
        </Button>
      ) : (
        <Button type="submit" variant="outline">
          Cerrar sesión
        </Button>
      )}
    </form>
  );
}

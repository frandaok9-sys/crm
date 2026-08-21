import { redirect } from "next/navigation";

// Entrada: al escritorio de aplicaciones (exige sesión activa).
export default function Home() {
  redirect("/apps");
}

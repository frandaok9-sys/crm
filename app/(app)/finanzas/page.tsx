import { redirect } from "next/navigation";

/** Ruta histórica: Finanzas ahora vive dentro de Contabilidad. */
export default function FinanzasRedirect() {
  redirect("/contabilidad/finanzas");
}

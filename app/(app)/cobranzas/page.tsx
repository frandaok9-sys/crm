import { redirect } from "next/navigation";

/** Ruta histórica: Cobranzas ahora vive dentro de Contabilidad. */
export default function CobranzasRedirect() {
  redirect("/contabilidad/cobranzas");
}

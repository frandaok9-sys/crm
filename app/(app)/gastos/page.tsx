import { redirect } from "next/navigation";

/** Ruta histórica: Gastos ahora vive dentro de Contabilidad. */
export default function GastosRedirect() {
  redirect("/contabilidad/gastos");
}

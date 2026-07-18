import { redirect } from "next/navigation";

import { requireActiveUser } from "@/lib/auth";
import { canManageLedger, canLogExpenses } from "@/lib/permissions";

/** Entrada de Contabilidad: manda a la primera pestaña que el rol habilita. */
export default async function ContabilidadIndex() {
  const user = await requireActiveUser();
  if (canManageLedger(user)) redirect("/contabilidad/cobranzas");
  if (canLogExpenses(user)) redirect("/contabilidad/gastos");
  redirect("/dashboard");
}

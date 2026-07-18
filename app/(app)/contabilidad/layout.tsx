import { redirect } from "next/navigation";

import { requireActiveUser } from "@/lib/auth";
import {
  canManageLedger,
  canLogExpenses,
  canManageExpenses,
} from "@/lib/permissions";
import {
  ContabilidadTabs,
  type ContabilidadTab,
} from "@/components/contabilidad-tabs";

/**
 * Contabilidad: agrupa Cobranzas, Gastos y Finanzas en una sola sección con
 * sub-pestañas. Cada pestaña aparece solo si el rol la habilita (misma capa
 * central de permisos que cada página aplica por su cuenta).
 */
export default async function ContabilidadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireActiveUser();

  const tabs: ContabilidadTab[] = [
    ...(canManageLedger(user)
      ? [{ href: "/contabilidad/cobranzas", label: "Cobranzas" }]
      : []),
    ...(canLogExpenses(user)
      ? [{ href: "/contabilidad/gastos", label: "Gastos" }]
      : []),
    ...(canManageExpenses(user)
      ? [{ href: "/contabilidad/finanzas", label: "Finanzas" }]
      : []),
  ];
  if (tabs.length === 0) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[15px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Contabilidad
        </h1>
        <ContabilidadTabs tabs={tabs} />
      </div>
      {children}
    </div>
  );
}

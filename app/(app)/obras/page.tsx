import Link from "next/link";
import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { opportunityScope } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";

/**
 * Obras EN EJECUCIÓN: las oportunidades que están en la etapa
 * "En ejecución" del pipeline (un presupuesto aprobado pasa acá con
 * "Pasar a ejecución"). Cada una muestra presupuestado vs. costos
 * cargados y lleva a su detalle (panel de costos M4, tareas, alertas).
 */
export default async function ObrasPage() {
  const user = await requireActiveUser();

  const obras = await prisma.opportunity.findMany({
    where: {
      ...opportunityScope(user),
      stage: { name: "En ejecución" },
    },
    select: {
      id: true,
      title: true,
      currency: true,
      amount: true,
      estimatedM2: true,
      siteAddress: true,
      updatedAt: true,
      client: { select: { legalName: true } },
      owner: { select: { name: true, email: true } },
      expenses: { select: { amount: true, currency: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight">🏗️ En obra</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {obras.length} obra(s) en ejecución. Cuando termina, movela a
          &quot;Finalizada&quot; desde el pipeline.
        </p>
      </div>

      {obras.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-zinc-500 dark:bg-zinc-900">
          No hay obras en ejecución. Un presupuesto aprobado pasa acá con el
          botón &quot;Pasar a ejecución&quot;, o moviendo su oportunidad a la
          etapa &quot;En ejecución&quot; del pipeline.
        </div>
      ) : (
        <ul className="space-y-3">
          {obras.map((o) => {
            // Costos cargados a la obra, en la moneda del presupuesto.
            const cost = o.expenses
              .filter((e) => e.currency === o.currency)
              .reduce(
                (sum, e) => sum.plus(e.amount.toString()),
                new Decimal(0)
              );
            const otherCurrencyCount = o.expenses.filter(
              (e) => e.currency !== o.currency
            ).length;
            const amount = o.amount
              ? new Decimal(o.amount.toString())
              : null;
            const margin = amount && amount.gt(0) ? amount.minus(cost) : null;
            return (
              <li key={o.id}>
                <Link
                  href={`/oportunidades/${o.id}`}
                  className="block rounded-xl border bg-white p-5 transition-colors hover:border-primary/50 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{o.title}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {o.client.legalName}
                        {o.siteAddress && ` · ${o.siteAddress}`}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {o.owner
                          ? `Responsable: ${o.owner.name ?? o.owner.email}`
                          : "Sin responsable asignado"}
                        {o.estimatedM2 &&
                          ` · ${Number(o.estimatedM2).toLocaleString("es-AR")} m²`}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold tabular-nums">
                        {formatMoney(
                          o.amount ? o.amount.toString() : null,
                          o.currency
                        ) ?? "Sin monto"}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">
                        Costos: {formatMoney(cost.toFixed(2), o.currency)}
                        {otherCurrencyCount > 0 && " (+ otra moneda)"}
                      </p>
                      {margin && (
                        <p
                          className={`mt-0.5 text-xs font-medium tabular-nums ${
                            margin.lt(0)
                              ? "text-red-600 dark:text-red-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          Margen: {formatMoney(margin.toFixed(2), o.currency)}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

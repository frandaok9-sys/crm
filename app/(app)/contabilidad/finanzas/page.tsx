import Link from "next/link";
import { redirect } from "next/navigation";

import { requireActiveUser } from "@/lib/auth";
import { canManageExpenses } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { getMonthlyBalance } from "@/lib/finance";
import {
  COST_KIND_LABELS,
  currentMonth,
  monthLabel,
  monthRange,
} from "@/lib/expenses";
import { CostKind } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";

/**
 * M1 — Balance mensual: ingresos vs. costos (fijos/variables), resultado y
 * punto de equilibrio, SIEMPRE por moneda (ARS y USD nunca se suman). Los
 * números salen de lib/finance.ts, la misma fuente que la exportación Excel.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const user = await requireActiveUser();
  if (!canManageExpenses(user)) redirect("/dashboard");

  const month = monthRange(m ?? "") ? (m as string) : currentMonth();
  const cards = (await getMonthlyBalance(month)) ?? [];

  // Navegación de mes.
  const [y, mm] = month.split("-").map(Number);
  const prev = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`;
  const next = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Finanzas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Balance del mes: ingresos, costos y punto de equilibrio.{" "}
            <Link
              href="/contabilidad/gastos"
              className="font-medium text-primary hover:underline"
            >
              Cargar gastos →
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/contabilidad/finanzas?m=${prev}`}>
            <Button variant="outline" size="sm">←</Button>
          </Link>
          <span className="min-w-[130px] text-center font-semibold capitalize">
            {monthLabel(month)}
          </span>
          <Link href={`/contabilidad/finanzas?m=${next}`}>
            <Button variant="outline" size="sm">→</Button>
          </Link>
          {/* Descarga: <a> nativo (no Link) para que el navegador baje el archivo. */}
          <a href={`/contabilidad/finanzas/export?m=${month}`}>
            <Button variant="outline" size="sm">⬇ Exportar Excel</Button>
          </a>
        </div>
      </div>

      {cards.length === 0 && (
        <section className="rounded-[12px] border bg-card p-8 text-center text-sm text-muted-foreground">
          Sin facturación ni gastos en {monthLabel(month)}. El balance se arma
          solo con lo que se registra en cuentas corrientes y en Gastos.
        </section>
      )}

      {cards.map((card) => {
        const f = card.finance;
        const positive = Number(f.result) >= 0;
        const hasInternal = Number(card.internalIncome) !== 0;
        const maxCategory = card.byCategory[0]
          ? Number(card.byCategory[0].total)
          : 0;
        return (
          <section key={card.currency} className="rounded-[12px] border bg-card p-5">
            <h2 className="mb-4 text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              Balance {card.currency} — {monthLabel(month)}
            </h2>

            <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[10px] border border-border2 bg-card2 p-4">
                <p className="text-xs text-muted-foreground">Ingresos (ventas)</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatMoney(f.income, card.currency)}
                </p>
                {hasInternal && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Facturado {formatMoney(card.invoicedIncome, card.currency)} · Sin
                    factura {formatMoney(card.internalIncome, card.currency)}
                  </p>
                )}
              </div>
              <div className="rounded-[10px] border border-border2 bg-card2 p-4">
                <p className="text-xs text-muted-foreground">Costos del mes</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatMoney(f.totalCosts, card.currency)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Fijos {formatMoney(f.fixedCosts, card.currency)} · Variables{" "}
                  {formatMoney(f.variableCosts, card.currency)}
                </p>
              </div>
              <div className="rounded-[10px] border border-border2 bg-card2 p-4">
                <p className="text-xs text-muted-foreground">Resultado</p>
                <p
                  className={`mt-1 text-xl font-bold tabular-nums ${
                    positive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {formatMoney(f.result, card.currency)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {positive ? "Mes con ganancia" : "Mes con pérdida"}
                </p>
              </div>
              <div className="rounded-[10px] border border-border2 bg-card2 p-4">
                <p className="text-xs text-muted-foreground">Punto de equilibrio</p>
                {f.breakEven ? (
                  <>
                    <p className="mt-1 text-xl font-bold tabular-nums">
                      {formatMoney(f.breakEven, card.currency)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Facturación mínima para no perder
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">{f.breakEvenNote}</p>
                )}
              </div>
            </div>

            {card.byCategory.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Costos por categoría
                </h3>
                <div className="space-y-1.5">
                  {card.byCategory.map((c) => {
                    const pct =
                      maxCategory > 0 ? (Number(c.total) / maxCategory) * 100 : 0;
                    return (
                      <div key={c.name} className="flex items-center gap-3 text-[13px]">
                        <span className="w-44 shrink-0 truncate text-text2">
                          {c.name}
                          <span className="ml-1 text-[10px] text-muted2">
                            {COST_KIND_LABELS[c.kind]}
                          </span>
                        </span>
                        <div className="h-2 flex-1 rounded-[4px] bg-chip">
                          <div
                            className="h-2 rounded-[4px]"
                            style={{
                              width: `${Math.max(pct, 3)}%`,
                              background:
                                c.kind === CostKind.FIXED ? "#5B82D6" : "#E0503A",
                            }}
                          />
                        </div>
                        <span className="w-28 shrink-0 text-right font-semibold tabular-nums">
                          {formatMoney(c.total, card.currency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Los ingresos salen de la facturación registrada en cuentas corrientes
        (facturas y notas de débito, menos notas de crédito). Los costos salen
        del módulo Gastos. ARS y USD se calculan por separado, nunca se suman.
      </p>
    </div>
  );
}

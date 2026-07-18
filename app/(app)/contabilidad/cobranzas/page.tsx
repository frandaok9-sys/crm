import Link from "next/link";
import { redirect } from "next/navigation";

import { requireActiveUser } from "@/lib/auth";
import { canManageLedger } from "@/lib/permissions";
import { getReceivables } from "@/lib/receivables";
import { formatMoney } from "@/lib/opportunities";
import { Currency } from "@/lib/generated/prisma/enums";
import { KpiCard } from "@/components/kpi-card";
import { TintBadge, type TintVariant } from "@/components/tint-badge";

const GRID = "grid grid-cols-[2fr_0.8fr_1.3fr_1.1fr_1.4fr_1fr] items-center";

function agingVariant(days: number): TintVariant {
  if (days > 60) return "red";
  if (days > 30) return "amber";
  return "gray";
}

export default async function ReceivablesPage() {
  const user = await requireActiveUser();
  if (!canManageLedger(user)) redirect("/dashboard");

  const { summary, rows } = await getReceivables();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight">Cobranzas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuentas corrientes con saldo deudor, facturas abiertas y pagos sin
          imputar.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-[14px] lg:grid-cols-5">
        <KpiCard
          size="md"
          label="Por cobrar ARS"
          value={formatMoney(summary.totalARS, Currency.ARS) ?? "—"}
        />
        <KpiCard
          size="md"
          label="Por cobrar USD"
          value={formatMoney(summary.totalUSD, Currency.USD) ?? "—"}
        />
        <KpiCard
          size="md"
          label="Cuentas con deuda"
          value={String(summary.debtorAccounts)}
        />
        <KpiCard
          size="md"
          label="Facturas abiertas"
          value={String(summary.openInvoices)}
        />
        <KpiCard
          size="md"
          label="Pagos sin imputar"
          value={String(summary.unallocatedPayments)}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[12px] border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          No hay cuentas con saldo deudor.
        </div>
      ) : (
        <section className="overflow-hidden rounded-[12px] border bg-card">
          <div
            className={`${GRID} border-b border-border2 bg-card2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground`}
          >
            <span>Cliente</span>
            <span>Moneda</span>
            <span className="text-right">Facturas abiertas</span>
            <span className="text-right">Antigüedad</span>
            <span className="text-right">Saldo deudor</span>
            <span />
          </div>
          {rows.map((row) => (
            <div
              key={`${row.clientId}-${row.currency}`}
              className={`${GRID} border-b border-border2 px-5 py-[14px] text-[13px] transition-colors last:border-0 hover:bg-hoverbg`}
            >
              <span className="truncate pr-3 text-[13.5px] font-bold">
                {row.legalName}
              </span>
              <span className="text-text2">{row.currency}</span>
              <span className="text-right tabular-nums text-text2">
                {row.openInvoices}
              </span>
              <span className="text-right">
                {row.oldestDays != null ? (
                  <TintBadge variant={agingVariant(row.oldestDays)} className="tabular-nums">
                    {row.oldestDays} días
                  </TintBadge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
              <span className="text-right font-bold tabular-nums">
                {formatMoney(row.balance, row.currency)}
              </span>
              <span className="text-right">
                <Link
                  href={`/clientes/${row.clientId}/cuenta`}
                  className="text-[12.5px] font-semibold text-primary hover:underline"
                >
                  Ver cuenta →
                </Link>
              </span>
            </div>
          ))}
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Antigüedad: días desde la factura abierta más vieja. Ámbar: más de 30
        días · Rojo: más de 60 días.
      </p>
    </div>
  );
}

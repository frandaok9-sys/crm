import Link from "next/link";
import { redirect } from "next/navigation";

import { requireActiveUser } from "@/lib/auth";
import { canManageLedger } from "@/lib/permissions";
import { getReceivables } from "@/lib/receivables";
import { formatMoney } from "@/lib/opportunities";
import { Currency } from "@/lib/generated/prisma/enums";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-l-4 border-primary bg-card p-4 shadow-sm">
      <div className="font-heading text-2xl font-semibold">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function agingClass(days: number | null): string {
  if (days == null) return "text-zinc-500";
  if (days > 60) return "text-red-600 dark:text-red-400 font-semibold";
  if (days > 30) return "text-amber-600 dark:text-amber-400 font-medium";
  return "text-zinc-500";
}

export default async function ReceivablesPage() {
  const user = await requireActiveUser();
  if (!canManageLedger(user)) redirect("/dashboard");

  const { summary, rows } = await getReceivables();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cobranzas</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Cuentas corrientes con saldo deudor, facturas abiertas y pagos sin
          imputar.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Por cobrar ARS"
          value={formatMoney(summary.totalARS, Currency.ARS) ?? "—"}
        />
        <Stat
          label="Por cobrar USD"
          value={formatMoney(summary.totalUSD, Currency.USD) ?? "—"}
        />
        <Stat label="Cuentas con deuda" value={String(summary.debtorAccounts)} />
        <Stat label="Facturas abiertas" value={String(summary.openInvoices)} />
        <Stat
          label="Pagos sin imputar"
          value={String(summary.unallocatedPayments)}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-zinc-500 dark:bg-zinc-900">
          🎉 No hay cuentas con saldo deudor.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Moneda</th>
                <th className="px-4 py-3 text-right font-medium">
                  Facturas abiertas
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Antigüedad
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Saldo deudor
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.clientId}-${row.currency}`}
                  className="border-b last:border-0"
                >
                  <td className="px-4 py-3 font-medium">{row.legalName}</td>
                  <td className="px-4 py-3">{row.currency}</td>
                  <td className="px-4 py-3 text-right">{row.openInvoices}</td>
                  <td
                    className={`px-4 py-3 text-right ${agingClass(row.oldestDays)}`}
                  >
                    {row.oldestDays != null ? `${row.oldestDays} días` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(row.balance, row.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/clientes/${row.clientId}/cuenta`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Ver cuenta →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-500">
        Antigüedad: días desde la factura abierta más vieja. 🟡 más de 30 días
        · 🔴 más de 60 días.
      </p>
    </div>
  );
}

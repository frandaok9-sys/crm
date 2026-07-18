import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canViewRecord, canManageLedger } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { computeBalances, isDebit } from "@/lib/ledger-calc";
import { LEDGER_TYPE_LABELS } from "@/lib/ledger";
import { FISCAL_KIND_LABELS } from "@/lib/expenses";
import {
  Currency,
  LedgerMovementType,
  FiscalKind,
} from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { addMovement, deleteMovement } from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

function balanceLabel(balance: string): { text: string; className: string } {
  const value = Number(balance);
  if (value > 0) {
    return { text: "Saldo deudor", className: "text-red-600 dark:text-red-400" };
  }
  if (value < 0) {
    return {
      text: "Saldo a favor",
      className: "text-emerald-600 dark:text-emerald-400",
    };
  }
  return { text: "Saldado", className: "text-zinc-500" };
}

export default async function LedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireActiveUser();

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, legalName: true, ownerId: true },
  });
  if (!client) notFound();
  if (!canViewRecord(user, client)) redirect("/clientes");

  const canManage = canManageLedger(user);
  const movements = await prisma.ledgerMovement.findMany({
    where: { clientId: id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      allocationsAsInvoice: { select: { amount: true } },
      allocationsAsPayment: { select: { amount: true } },
    },
  });

  // Por movimiento: cuánto tiene imputado (como factura o como pago).
  function allocated(rows: { amount: unknown }[]): Decimal {
    return rows.reduce(
      (sum, a) => sum.plus(String(a.amount)),
      new Decimal(0)
    );
  }

  const balances = computeBalances(
    movements.map((m) => ({
      type: m.type,
      currency: m.currency,
      amount: m.amount.toString(),
    }))
  );

  // M3: saldos separados fiscal / interno (solo si hay movimientos internos).
  const hasInternal = movements.some((m) => m.fiscalKind === FiscalKind.INTERNAL);
  const balancesBy = (kind: FiscalKind) =>
    computeBalances(
      movements
        .filter((m) => m.fiscalKind === kind)
        .map((m) => ({
          type: m.type,
          currency: m.currency,
          amount: m.amount.toString(),
        }))
    );
  const fiscalBalances = hasInternal ? balancesBy(FiscalKind.INVOICED) : [];
  const internalBalances = hasInternal ? balancesBy(FiscalKind.INTERNAL) : [];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/clientes/${id}`}
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Volver al cliente
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Cuenta corriente
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{client.legalName}</p>
      </div>

      {/* Saldos por moneda */}
      <div className="grid gap-3 sm:grid-cols-2">
        {balances.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-zinc-500 dark:bg-zinc-900">
            Sin movimientos.
          </div>
        ) : (
          balances.map((b) => {
            const info = balanceLabel(b.balance);
            const currency =
              b.currency === Currency.USD ? Currency.USD : Currency.ARS;
            return (
              <div
                key={b.currency}
                className="rounded-xl border bg-white p-4 dark:bg-zinc-900"
              >
                <div className="text-xs text-zinc-500">{b.currency}</div>
                <div className={`text-2xl font-semibold ${info.className}`}>
                  {formatMoney(
                    (Math.abs(Number(b.balance))).toFixed(2),
                    currency
                  )}
                </div>
                <div className={`text-xs ${info.className}`}>{info.text}</div>
              </div>
            );
          })
        )}
      </div>

      {/* M3: desglose fiscal / interno (los saldos de arriba son el consolidado) */}
      {hasInternal && (
        <div className="rounded-xl border bg-white p-4 text-sm dark:bg-zinc-900">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Desglose fiscal / interno (consolidado arriba)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-zinc-500">Facturado</p>
              {fiscalBalances.length === 0 ? (
                <p className="text-zinc-400">—</p>
              ) : (
                fiscalBalances.map((b) => (
                  <p key={b.currency} className="tabular-nums">
                    {b.currency}{" "}
                    {formatMoney(
                      Math.abs(Number(b.balance)).toFixed(2),
                      b.currency === Currency.USD ? Currency.USD : Currency.ARS
                    )}{" "}
                    <span className="text-xs text-zinc-500">
                      {Number(b.balance) >= 0 ? "deudor" : "a favor"}
                    </span>
                  </p>
                ))
              )}
            </div>
            <div>
              <p className="text-xs text-zinc-500">Sin factura (interno)</p>
              {internalBalances.length === 0 ? (
                <p className="text-zinc-400">—</p>
              ) : (
                internalBalances.map((b) => (
                  <p key={b.currency} className="tabular-nums">
                    {b.currency}{" "}
                    {formatMoney(
                      Math.abs(Number(b.balance)).toFixed(2),
                      b.currency === Currency.USD ? Currency.USD : Currency.ARS
                    )}{" "}
                    <span className="text-xs text-zinc-500">
                      {Number(b.balance) >= 0 ? "deudor" : "a favor"}
                    </span>
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alta de movimiento */}
      {canManage && (
        <section className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-500">
            Registrar movimiento
          </h2>
          <form action={addMovement} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="clientId" value={id} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Tipo
              </span>
              <select name="type" className={inputClass}>
                {Object.values(LedgerMovementType).map((t) => (
                  <option key={t} value={t}>
                    {LEDGER_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Moneda
              </span>
              <select name="currency" className={inputClass}>
                <option value={Currency.ARS}>Pesos (ARS)</option>
                <option value={Currency.USD}>Dólares (USD)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Importe
              </span>
              <input
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Fecha
              </span>
              <input
                type="date"
                name="date"
                defaultValue={today}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Comprobante
              </span>
              <input
                name="reference"
                placeholder="N° factura/recibo"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Descripción
              </span>
              <input name="description" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Comprobante fiscal
              </span>
              <select name="fiscalKind" defaultValue={FiscalKind.INVOICED} className={inputClass}>
                <option value={FiscalKind.INVOICED}>Facturado</option>
                <option value={FiscalKind.INTERNAL}>Sin factura (interno)</option>
              </select>
            </label>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input type="checkbox" name="autoAllocate" defaultChecked />
              Imputar automáticamente a las facturas más antiguas (solo pagos
              y notas de crédito)
            </label>
            <div className="flex justify-end">
              <SubmitButton pendingText="Registrando…">Registrar</SubmitButton>
            </div>
          </form>
        </section>
      )}

      {/* Movimientos */}
      <section className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Detalle</th>
              <th className="px-4 py-3 font-medium">Moneda</th>
              <th className="px-4 py-3 text-right font-medium">Debe</th>
              <th className="px-4 py-3 text-right font-medium">Haber</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 ? (
              <tr>
                <td
                  colSpan={canManage ? 7 : 6}
                  className="px-4 py-6 text-center text-sm text-zinc-400"
                >
                  Sin movimientos registrados.
                </td>
              </tr>
            ) : (
              movements.map((m) => {
                const currency =
                  m.currency === Currency.USD ? Currency.USD : Currency.ARS;
                const amountLabel = formatMoney(m.amount.toString(), currency);
                const debit = isDebit(m.type);

                // Estado de imputación del movimiento.
                const total = new Decimal(m.amount.toString());
                const applied = debit
                  ? allocated(m.allocationsAsInvoice)
                  : allocated(m.allocationsAsPayment);
                const pending = total.minus(applied);
                let chip: { label: string; className: string } | null = null;
                if (debit) {
                  if (applied.greaterThanOrEqualTo(total) && total.gt(0)) {
                    chip = {
                      label: "Cancelada",
                      className:
                        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                    };
                  } else if (applied.gt(0)) {
                    chip = {
                      label: `Parcial · pagado ${formatMoney(applied.toFixed(2), currency)}`,
                      className:
                        "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                    };
                  } else {
                    chip = {
                      label: "Pendiente",
                      className:
                        "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                    };
                  }
                } else if (pending.gt(0)) {
                  chip = {
                    label: `Sin imputar ${formatMoney(pending.toFixed(2), currency)}`,
                    className: "bg-primary/10 text-primary",
                  };
                }

                return (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-zinc-500">
                      {m.date.toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-4 py-3">{LEDGER_TYPE_LABELS[m.type]}</td>
                    <td className="px-4 py-3">
                      {m.reference && (
                        <span className="font-medium">{m.reference} </span>
                      )}
                      <span className="text-zinc-500">{m.description}</span>
                      {m.fiscalKind === FiscalKind.INTERNAL && (
                        <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {FISCAL_KIND_LABELS[m.fiscalKind]}
                        </span>
                      )}
                      {chip && (
                        <span
                          className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.className}`}
                        >
                          {chip.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{m.currency}</td>
                    <td className="px-4 py-3 text-right">
                      {debit ? amountLabel : ""}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {debit ? "" : amountLabel}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <form action={deleteMovement}>
                          <input type="hidden" name="id" value={m.id} />
                          <Button type="submit" size="sm" variant="ghost">
                            ✕
                          </Button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

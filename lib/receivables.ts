import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { isDebit } from "@/lib/ledger-calc";
import { Currency, LedgerMovementType } from "@/lib/generated/prisma/enums";

/**
 * Cuentas por cobrar: saldos deudores por cliente y moneda, facturas
 * abiertas con antigüedad y pagos sin imputar. Todo calculado con Decimal.
 */

export type ReceivableRow = {
  clientId: string;
  legalName: string;
  currency: Currency;
  balance: string; // saldo deudor (> 0)
  openInvoices: number; // facturas/ND con resto pendiente
  oldestDays: number | null; // antigüedad de la más vieja abierta
};

export type ReceivablesSummary = {
  totalARS: string;
  totalUSD: string;
  debtorAccounts: number; // pares cliente-moneda con deuda
  openInvoices: number;
  unallocatedPayments: number; // pagos/NC con resto sin imputar
};

export type Receivables = {
  summary: ReceivablesSummary;
  rows: ReceivableRow[];
};

const DEBIT_TYPES = [
  LedgerMovementType.INVOICE,
  LedgerMovementType.DEBIT_NOTE,
];
const CREDIT_TYPES = [
  LedgerMovementType.PAYMENT,
  LedgerMovementType.CREDIT_NOTE,
];

export async function getReceivables(): Promise<Receivables> {
  const [grouped, debits, credits] = await Promise.all([
    prisma.ledgerMovement.groupBy({
      by: ["clientId", "currency", "type"],
      _sum: { amount: true },
    }),
    prisma.ledgerMovement.findMany({
      where: { type: { in: DEBIT_TYPES } },
      select: {
        clientId: true,
        currency: true,
        amount: true,
        date: true,
        allocationsAsInvoice: { select: { amount: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.ledgerMovement.findMany({
      where: { type: { in: CREDIT_TYPES } },
      select: {
        amount: true,
        allocationsAsPayment: { select: { amount: true } },
      },
    }),
  ]);

  // Saldo por cliente-moneda (debe − haber).
  const balances = new Map<string, Decimal>();
  for (const g of grouped) {
    const key = `${g.clientId}|${g.currency}`;
    const amount = new Decimal(g._sum.amount?.toString() ?? "0");
    const current = balances.get(key) ?? new Decimal(0);
    balances.set(
      key,
      isDebit(g.type) ? current.plus(amount) : current.minus(amount)
    );
  }

  // Facturas abiertas por cliente-moneda (resto > 0) + antigüedad.
  const openByKey = new Map<string, { count: number; oldest: Date }>();
  let openInvoices = 0;
  for (const debit of debits) {
    const paid = debit.allocationsAsInvoice.reduce(
      (sum, a) => sum.plus(a.amount.toString()),
      new Decimal(0)
    );
    const remaining = new Decimal(debit.amount.toString()).minus(paid);
    if (remaining.lessThanOrEqualTo(0)) continue;
    openInvoices++;
    const key = `${debit.clientId}|${debit.currency}`;
    const entry = openByKey.get(key);
    if (entry) {
      entry.count++;
    } else {
      openByKey.set(key, { count: 1, oldest: debit.date });
    }
  }

  // Pagos con resto sin imputar.
  let unallocatedPayments = 0;
  for (const credit of credits) {
    const applied = credit.allocationsAsPayment.reduce(
      (sum, a) => sum.plus(a.amount.toString()),
      new Decimal(0)
    );
    if (new Decimal(credit.amount.toString()).minus(applied).gt(0)) {
      unallocatedPayments++;
    }
  }

  // Filas deudoras con nombre de cliente.
  const debtorKeys = [...balances.entries()].filter(([, b]) => b.gt(0));
  const clientIds = [...new Set(debtorKeys.map(([key]) => key.split("|")[0]))];
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: { id: true, legalName: true },
  });
  const nameById = new Map(clients.map((c) => [c.id, c.legalName]));

  const now = Date.now();
  let totalARS = new Decimal(0);
  let totalUSD = new Decimal(0);
  const rows: ReceivableRow[] = debtorKeys.map(([key, balance]) => {
    const [clientId, currency] = key.split("|") as [string, Currency];
    if (currency === Currency.USD) totalUSD = totalUSD.plus(balance);
    else totalARS = totalARS.plus(balance);
    const open = openByKey.get(key);
    return {
      clientId,
      legalName: nameById.get(clientId) ?? "(cliente)",
      currency,
      balance: balance.toFixed(2),
      openInvoices: open?.count ?? 0,
      oldestDays: open
        ? Math.floor((now - open.oldest.getTime()) / 86_400_000)
        : null,
    };
  });

  rows.sort((a, b) => {
    if (a.currency !== b.currency) return a.currency === Currency.ARS ? -1 : 1;
    return Number(b.balance) - Number(a.balance);
  });

  return {
    summary: {
      totalARS: totalARS.toFixed(2),
      totalUSD: totalUSD.toFixed(2),
      debtorAccounts: debtorKeys.length,
      openInvoices,
      unallocatedPayments,
    },
    rows,
  };
}

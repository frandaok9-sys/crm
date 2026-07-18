import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { computeMonthFinance, type MonthFinance } from "@/lib/finance-calc";
import { monthRange } from "@/lib/expenses";
import {
  CostKind,
  Currency,
  FiscalKind,
  LedgerMovementType,
} from "@/lib/generated/prisma/enums";

/**
 * Balance mensual (M1): agrega ingresos (facturación de cuentas corrientes) y
 * costos (módulo Gastos) POR MONEDA — ARS y USD nunca se suman. Lo consumen la
 * página /contabilidad/finanzas y la exportación a Excel, así los números son
 * siempre los mismos en pantalla y en planilla.
 */

export type BalanceCategoryRow = {
  name: string;
  kind: CostKind;
  total: string; // decimal string 2 posiciones
};

export type CurrencyBalance = {
  currency: Currency;
  finance: MonthFinance;
  invoicedIncome: string; // ingresos con comprobante fiscal
  internalIncome: string; // ingresos "sin factura" (interno)
  byCategory: BalanceCategoryRow[]; // costos del mes, de mayor a menor
};

export async function getMonthlyBalance(
  month: string
): Promise<CurrencyBalance[] | null> {
  const range = monthRange(month);
  if (!range) return null;

  const [movements, expenses] = await Promise.all([
    prisma.ledgerMovement.findMany({
      where: { date: { gte: range.gte, lt: range.lt } },
      select: { type: true, currency: true, amount: true, fiscalKind: true },
    }),
    prisma.expense.findMany({
      where: { date: { gte: range.gte, lt: range.lt } },
      select: {
        amount: true,
        currency: true,
        category: { select: { name: true, kind: true } },
      },
    }),
  ]);

  // Ingresos: facturas + notas de débito suman, notas de crédito restan.
  // Los PAGOS no son ingresos (son cobranza de esas ventas).
  type IncomeAcc = { total: Decimal; invoiced: Decimal; internal: Decimal };
  const income = new Map<string, IncomeAcc>();
  for (const mv of movements) {
    const sign =
      mv.type === LedgerMovementType.INVOICE ||
      mv.type === LedgerMovementType.DEBIT_NOTE
        ? 1
        : mv.type === LedgerMovementType.CREDIT_NOTE
          ? -1
          : 0;
    if (sign === 0) continue;
    const acc =
      income.get(mv.currency) ??
      { total: new Decimal(0), invoiced: new Decimal(0), internal: new Decimal(0) };
    const amount = new Decimal(mv.amount.toString()).times(sign);
    acc.total = acc.total.plus(amount);
    if (mv.fiscalKind === FiscalKind.INTERNAL) {
      acc.internal = acc.internal.plus(amount);
    } else {
      acc.invoiced = acc.invoiced.plus(amount);
    }
    income.set(mv.currency, acc);
  }

  // Costos por moneda: fijos/variables + detalle por categoría.
  type CostAcc = {
    fixed: Decimal;
    variable: Decimal;
    byCategory: Map<string, { kind: CostKind; total: Decimal }>;
  };
  const costs = new Map<string, CostAcc>();
  for (const e of expenses) {
    const acc =
      costs.get(e.currency) ??
      { fixed: new Decimal(0), variable: new Decimal(0), byCategory: new Map() };
    const amount = new Decimal(e.amount.toString());
    if (e.category.kind === CostKind.FIXED) acc.fixed = acc.fixed.plus(amount);
    else acc.variable = acc.variable.plus(amount);
    const cat =
      acc.byCategory.get(e.category.name) ??
      { kind: e.category.kind, total: new Decimal(0) };
    cat.total = cat.total.plus(amount);
    acc.byCategory.set(e.category.name, cat);
    costs.set(e.currency, acc);
  }

  const currencies = [...new Set([...income.keys(), ...costs.keys()])].sort();
  return currencies.map((currency) => {
    const inc = income.get(currency);
    const cost = costs.get(currency);
    return {
      currency: currency === Currency.USD ? Currency.USD : Currency.ARS,
      finance: computeMonthFinance({
        income: inc?.total.toString() ?? 0,
        fixedCosts: cost?.fixed.toString() ?? 0,
        variableCosts: cost?.variable.toString() ?? 0,
      }),
      invoicedIncome: (inc?.invoiced ?? new Decimal(0)).toFixed(2),
      internalIncome: (inc?.internal ?? new Decimal(0)).toFixed(2),
      byCategory: [...(cost?.byCategory.entries() ?? [])]
        .map(([name, v]) => ({ name, kind: v.kind, total: v.total.toFixed(2) }))
        .sort((a, b) => new Decimal(b.total).comparedTo(a.total)),
    };
  });
}

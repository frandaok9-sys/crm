import Decimal from "decimal.js";

/**
 * Pure current-account (cuenta corriente) math.
 *
 * Rules (per project spec):
 * - Balances are kept SEPARATE per currency — amounts of different currencies
 *   are NEVER added together.
 * - Money uses Decimal, never floating point.
 * - Balance is DERIVED from movements: debit − credit.
 *
 * Debit types increase what the client owes (facturas, notas de débito).
 * Credit types decrease it (pagos, notas de crédito).
 */

export const DEBIT_TYPES = ["INVOICE", "DEBIT_NOTE"] as const;
export const CREDIT_TYPES = ["PAYMENT", "CREDIT_NOTE"] as const;

export function isDebit(type: string): boolean {
  return (DEBIT_TYPES as readonly string[]).includes(type);
}

export type LedgerMovementInput = {
  type: string;
  currency: string;
  amount: string | number;
};

export type CurrencyBalance = {
  currency: string;
  debit: string;
  credit: string;
  balance: string; // debit − credit (positive ⇒ the client owes us)
};

export function computeBalances(
  movements: LedgerMovementInput[]
): CurrencyBalance[] {
  const byCurrency = new Map<string, { debit: Decimal; credit: Decimal }>();

  for (const movement of movements) {
    const entry =
      byCurrency.get(movement.currency) ??
      { debit: new Decimal(0), credit: new Decimal(0) };
    const amount = new Decimal(movement.amount || 0).toDecimalPlaces(2);
    if (isDebit(movement.type)) {
      entry.debit = entry.debit.plus(amount);
    } else {
      entry.credit = entry.credit.plus(amount);
    }
    byCurrency.set(movement.currency, entry);
  }

  return [...byCurrency.entries()]
    .map(([currency, { debit, credit }]) => ({
      currency,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      balance: debit.minus(credit).toFixed(2),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

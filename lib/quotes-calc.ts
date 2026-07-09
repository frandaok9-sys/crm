import Decimal from "decimal.js";

/**
 * Pure quote math. Money is handled with Decimal (never floating point) and
 * IVA is discriminated per rate ("alícuota"), per the project rules.
 *
 * All amounts are returned as fixed 2-decimal strings so callers can store
 * them directly in Decimal DB columns without precision loss.
 */

export type QuoteLineInput = {
  quantity: string | number;
  unitPrice: string | number;
  ivaRate: string | number; // percentage: 21, 10.5, 27, 0…
  discount?: string | number; // percentage: 0–100
};

export type IvaBreakdownRow = {
  rate: string; // "21.00"
  base: string; // net amount taxed at this rate
  amount: string; // IVA for this rate
};

export type QuoteTotals = {
  net: string; // subtotal without IVA
  ivaBreakdown: IvaBreakdownRow[];
  ivaTotal: string;
  total: string;
};

const SCALE = 2;

function d(value: string | number): Decimal {
  return new Decimal(value === "" || value == null ? 0 : value);
}

function money(value: Decimal): string {
  return value.toFixed(SCALE);
}

/** Discount multiplier: 10% → 0.9. Values outside 0–100 are clamped. */
function discountFactor(discount: string | number | undefined): Decimal {
  const pct = Decimal.min(Decimal.max(d(discount ?? 0), 0), 100);
  return new Decimal(1).minus(pct.dividedBy(100));
}

/**
 * Net amount of a single line: quantity × unit price × (1 − discount%),
 * rounded to 2 decimals.
 */
export function lineNet(
  quantity: string | number,
  unitPrice: string | number,
  discount: string | number = 0
): string {
  return money(
    d(quantity)
      .times(d(unitPrice))
      .times(discountFactor(discount))
      .toDecimalPlaces(SCALE)
  );
}

/**
 * Computes the net subtotal, IVA discriminated by rate, and the grand total.
 * Each line's net is rounded to 2 decimals; IVA is computed per rate group.
 */
export function computeQuoteTotals(lines: QuoteLineInput[]): QuoteTotals {
  const netByRate = new Map<string, Decimal>();
  let net = new Decimal(0);

  for (const line of lines) {
    const lineNetValue = d(line.quantity)
      .times(d(line.unitPrice))
      .times(discountFactor(line.discount))
      .toDecimalPlaces(SCALE);
    net = net.plus(lineNetValue);

    const rateKey = d(line.ivaRate).toFixed(SCALE);
    netByRate.set(
      rateKey,
      (netByRate.get(rateKey) ?? new Decimal(0)).plus(lineNetValue)
    );
  }

  const rateKeys = [...netByRate.keys()].sort((a, b) =>
    new Decimal(a).comparedTo(b)
  );

  const ivaBreakdown: IvaBreakdownRow[] = [];
  let ivaTotal = new Decimal(0);

  for (const rateKey of rateKeys) {
    const base = netByRate.get(rateKey) as Decimal;
    const amount = base
      .times(new Decimal(rateKey).dividedBy(100))
      .toDecimalPlaces(SCALE);
    ivaTotal = ivaTotal.plus(amount);
    ivaBreakdown.push({
      rate: rateKey,
      base: money(base),
      amount: money(amount),
    });
  }

  return {
    net: money(net),
    ivaBreakdown,
    ivaTotal: money(ivaTotal),
    total: money(net.plus(ivaTotal)),
  };
}

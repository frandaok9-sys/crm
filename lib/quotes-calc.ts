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
  subtotal: string; // suma de netos por ítem, antes del descuento general
  overallDiscountPct: string; // % de descuento general aplicado
  overallDiscountAmount: string; // cuánto se descontó por el descuento general
  net: string; // base gravada = subtotal − descuento general
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
 * Computes the subtotal, an optional general discount, IVA discriminated by
 * rate, and the grand total. Each line's net is rounded to 2 decimals. The
 * general discount (`overallDiscount`, a percentage) is applied to each line's
 * net BEFORE grouping by IVA rate, so the tax stays correct per rate.
 */
export function computeQuoteTotals(
  lines: QuoteLineInput[],
  overallDiscount: string | number = 0
): QuoteTotals {
  const netByRate = new Map<string, Decimal>();
  const overallFactor = discountFactor(overallDiscount);
  let subtotal = new Decimal(0);
  let net = new Decimal(0);

  for (const line of lines) {
    const itemNet = d(line.quantity)
      .times(d(line.unitPrice))
      .times(discountFactor(line.discount))
      .toDecimalPlaces(SCALE);
    subtotal = subtotal.plus(itemNet);

    // Descuento general aplicado a cada neto (y redondeado) para que la suma
    // de las bases gravadas por alícuota cuadre exactamente con el neto total.
    const lineNetValue = itemNet.times(overallFactor).toDecimalPlaces(SCALE);
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

  const pct = Decimal.min(Decimal.max(d(overallDiscount), 0), 100);
  return {
    subtotal: money(subtotal),
    overallDiscountPct: pct.toFixed(SCALE),
    overallDiscountAmount: money(subtotal.minus(net)),
    net: money(net),
    ivaBreakdown,
    ivaTotal: money(ivaTotal),
    total: money(net.plus(ivaTotal)),
  };
}

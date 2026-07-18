import Decimal from "decimal.js";

/**
 * Matemática financiera pura del balance mensual (M1). Todo con Decimal y por
 * moneda (los llamadores NUNCA mezclan ARS con USD). Sin Prisma acá: esto es
 * lo que cubren los tests.
 */

export type MonthFinance = {
  income: string; // ingresos del mes (ventas netas de NC)
  fixedCosts: string;
  variableCosts: string;
  totalCosts: string;
  result: string; // ingresos − costos (puede ser negativo)
  /** Punto de equilibrio: cuánto hay que facturar para no perder plata. */
  breakEven: string | null;
  /** Por qué no hay punto de equilibrio, cuando breakEven es null. */
  breakEvenNote?: string;
};

const d = (v: string | number) => new Decimal(v === "" || v == null ? 0 : v);

/**
 * Punto de equilibrio = costos fijos ÷ (1 − costos variables / ingresos).
 * El divisor es el margen de contribución: qué parte de cada peso facturado
 * queda para cubrir los fijos. Casos borde:
 * - Sin ingresos en el mes → no se puede estimar el ratio de variables (null).
 * - Variables ≥ ingresos → margen nulo o negativo: no existe equilibrio (null).
 */
export function computeBreakEven(
  fixedCosts: string | number,
  variableCosts: string | number,
  income: string | number
): { value: string | null; note?: string } {
  const fixed = d(fixedCosts);
  const variable = d(variableCosts);
  const inc = d(income);

  if (inc.lte(0)) {
    return {
      value: null,
      note: "Sin ingresos en el mes no se puede estimar el punto de equilibrio.",
    };
  }
  const margin = new Decimal(1).minus(variable.dividedBy(inc));
  if (margin.lte(0)) {
    return {
      value: null,
      note: "Los costos variables igualan o superan los ingresos: no hay margen de contribución.",
    };
  }
  return { value: fixed.dividedBy(margin).toFixed(2) };
}

/** Consolida un mes: ingresos, costos fijos/variables, resultado y equilibrio. */
export function computeMonthFinance(input: {
  income: string | number;
  fixedCosts: string | number;
  variableCosts: string | number;
}): MonthFinance {
  const income = d(input.income);
  const fixed = d(input.fixedCosts);
  const variable = d(input.variableCosts);
  const total = fixed.plus(variable);
  const breakEven = computeBreakEven(
    fixed.toString(),
    variable.toString(),
    income.toString()
  );
  return {
    income: income.toFixed(2),
    fixedCosts: fixed.toFixed(2),
    variableCosts: variable.toFixed(2),
    totalCosts: total.toFixed(2),
    result: income.minus(total).toFixed(2),
    breakEven: breakEven.value,
    breakEvenNote: breakEven.note,
  };
}

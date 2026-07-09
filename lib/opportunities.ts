import { Currency } from "@/lib/generated/prisma/enums";

/** Formats a decimal amount string for display (never used for calculations). */
export function formatMoney(
  amount: string | null,
  currency: Currency
): string | null {
  if (amount == null) return null;
  const value = Number(amount);
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

import { describe, it, expect } from "vitest";

import { computeBalances } from "../lib/ledger-calc";

describe("computeBalances", () => {
  it("derives balance as debit minus credit", () => {
    const balances = computeBalances([
      { type: "INVOICE", currency: "ARS", amount: "1000.00" },
      { type: "PAYMENT", currency: "ARS", amount: "400.00" },
    ]);
    expect(balances).toEqual([
      { currency: "ARS", debit: "1000.00", credit: "400.00", balance: "600.00" },
    ]);
  });

  it("keeps currencies separate (never sums ARS with USD)", () => {
    const balances = computeBalances([
      { type: "INVOICE", currency: "ARS", amount: "1000" },
      { type: "INVOICE", currency: "USD", amount: "100" },
      { type: "PAYMENT", currency: "USD", amount: "30" },
    ]);
    expect(balances).toEqual([
      { currency: "ARS", debit: "1000.00", credit: "0.00", balance: "1000.00" },
      { currency: "USD", debit: "100.00", credit: "30.00", balance: "70.00" },
    ]);
  });

  it("treats debit notes as debit and credit notes as credit", () => {
    const balances = computeBalances([
      { type: "INVOICE", currency: "ARS", amount: "1000" },
      { type: "DEBIT_NOTE", currency: "ARS", amount: "200" },
      { type: "CREDIT_NOTE", currency: "ARS", amount: "300" },
    ]);
    expect(balances[0]).toEqual({
      currency: "ARS",
      debit: "1200.00",
      credit: "300.00",
      balance: "900.00",
    });
  });

  it("can go negative when the client has credit in their favor", () => {
    const balances = computeBalances([
      { type: "INVOICE", currency: "ARS", amount: "100" },
      { type: "PAYMENT", currency: "ARS", amount: "150" },
    ]);
    expect(balances[0].balance).toBe("-50.00");
  });

  it("returns an empty list for no movements", () => {
    expect(computeBalances([])).toEqual([]);
  });
});

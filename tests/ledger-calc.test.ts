import { describe, it, expect } from "vitest";

import { computeBalances, allocateFifo } from "../lib/ledger-calc";

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

describe("allocateFifo", () => {
  it("pays a single invoice exactly", () => {
    expect(allocateFifo([{ id: "f1", remaining: "1000.00" }], "1000")).toEqual([
      { invoiceId: "f1", amount: "1000.00" },
    ]);
  });

  it("spreads a payment across invoices oldest-first", () => {
    const allocations = allocateFifo(
      [
        { id: "f1", remaining: "300.00" },
        { id: "f2", remaining: "500.00" },
        { id: "f3", remaining: "400.00" },
      ],
      "700"
    );
    expect(allocations).toEqual([
      { invoiceId: "f1", amount: "300.00" },
      { invoiceId: "f2", amount: "400.00" },
    ]);
  });

  it("leaves the surplus unallocated when payment exceeds all invoices", () => {
    const allocations = allocateFifo(
      [{ id: "f1", remaining: "100.00" }],
      "250"
    );
    expect(allocations).toEqual([{ invoiceId: "f1", amount: "100.00" }]);
    // los $150 restantes quedan como crédito sin imputar
  });

  it("skips invoices already settled", () => {
    const allocations = allocateFifo(
      [
        { id: "f1", remaining: "0.00" },
        { id: "f2", remaining: "200.00" },
      ],
      "150"
    );
    expect(allocations).toEqual([{ invoiceId: "f2", amount: "150.00" }]);
  });

  it("returns nothing for a zero payment or no invoices", () => {
    expect(allocateFifo([], "500")).toEqual([]);
    expect(allocateFifo([{ id: "f1", remaining: "100" }], "0")).toEqual([]);
  });
});

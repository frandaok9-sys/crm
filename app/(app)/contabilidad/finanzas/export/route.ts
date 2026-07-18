import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageExpenses } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getMonthlyBalance } from "@/lib/finance";
import {
  COST_KIND_LABELS,
  FISCAL_KIND_LABELS,
  currentMonth,
  monthLabel,
  monthRange,
} from "@/lib/expenses";
import { LEDGER_TYPE_LABELS } from "@/lib/ledger";

const MONEY_FMT = "#,##0.00";

/**
 * Exportación del balance mensual a Excel (para el dueño / el contador).
 * /contabilidad/finanzas/export?m=AAAA-MM
 *
 * Hojas: Balance (resumen por moneda con punto de equilibrio), Costos por
 * categoría, Gastos del mes (detalle) y Facturación del mes (detalle).
 * Mismos números que la pantalla: todo sale de lib/finance.ts.
 */
export async function GET(request: Request) {
  const user = await requireActiveUser();
  if (!canManageExpenses(user)) {
    return new Response("No autorizado", { status: 403 });
  }

  const url = new URL(request.url);
  const mParam = url.searchParams.get("m") ?? "";
  const month = monthRange(mParam) ? mParam : currentMonth();
  const range = monthRange(month)!;
  const label = monthLabel(month);

  const [cards, expenses, movements] = await Promise.all([
    getMonthlyBalance(month),
    prisma.expense.findMany({
      where: { date: { gte: range.gte, lt: range.lt } },
      select: {
        date: true,
        amount: true,
        currency: true,
        paymentMethod: true,
        description: true,
        fiscalKind: true,
        category: { select: { name: true, kind: true } },
        opportunity: {
          select: { title: true, client: { select: { legalName: true } } },
        },
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.ledgerMovement.findMany({
      where: { date: { gte: range.gte, lt: range.lt } },
      select: {
        date: true,
        type: true,
        currency: true,
        amount: true,
        fiscalKind: true,
        reference: true,
        description: true,
        client: { select: { legalName: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  const dateFmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });

  // --- Hoja 1: Balance (resumen por moneda) --------------------------------
  const balance = workbook.addWorksheet("Balance");
  balance.columns = [
    { header: "Concepto", key: "k", width: 34 },
    { header: "Moneda", key: "c", width: 10 },
    { header: "Importe", key: "v", width: 18 },
  ];
  balance.getRow(1).font = { bold: true };
  balance.insertRow(1, { k: `Balance mensual — ${label}` });
  balance.getRow(1).font = { bold: true, size: 14 };
  balance.getRow(2).font = { bold: true };

  for (const card of cards ?? []) {
    const f = card.finance;
    const rows: [string, string | number][] = [
      ["Ingresos (ventas)", Number(f.income)],
      ["  · Facturado", Number(card.invoicedIncome)],
      ["  · Sin factura (interno)", Number(card.internalIncome)],
      ["Costos fijos", Number(f.fixedCosts)],
      ["Costos variables", Number(f.variableCosts)],
      ["Costos totales", Number(f.totalCosts)],
      ["Resultado del mes", Number(f.result)],
      [
        "Punto de equilibrio",
        f.breakEven != null ? Number(f.breakEven) : (f.breakEvenNote ?? "—"),
      ],
    ];
    for (const [k, v] of rows) {
      const row = balance.addRow({ k, c: card.currency, v });
      if (typeof v === "number") row.getCell("v").numFmt = MONEY_FMT;
      if (k === "Resultado del mes") row.font = { bold: true };
    }
    balance.addRow({});
  }
  if (!cards || cards.length === 0) {
    balance.addRow({ k: "Sin facturación ni gastos en el mes." });
  }

  // --- Hoja 2: Costos por categoría ----------------------------------------
  const cats = workbook.addWorksheet("Costos por categoría");
  cats.columns = [
    { header: "Moneda", key: "c", width: 10 },
    { header: "Categoría", key: "n", width: 28 },
    { header: "Tipo", key: "t", width: 12 },
    { header: "Total", key: "v", width: 18 },
  ];
  cats.getRow(1).font = { bold: true };
  for (const card of cards ?? []) {
    for (const c of card.byCategory) {
      const row = cats.addRow({
        c: card.currency,
        n: c.name,
        t: COST_KIND_LABELS[c.kind],
        v: Number(c.total),
      });
      row.getCell("v").numFmt = MONEY_FMT;
    }
  }

  // --- Hoja 3: Gastos del mes (detalle) ------------------------------------
  const sheet = workbook.addWorksheet("Gastos del mes");
  sheet.columns = [
    { header: "Fecha", key: "f", width: 12 },
    { header: "Categoría", key: "cat", width: 22 },
    { header: "Tipo", key: "t", width: 10 },
    { header: "Detalle", key: "d", width: 34 },
    { header: "Medio de pago", key: "mp", width: 16 },
    { header: "Obra", key: "o", width: 30 },
    { header: "Cargado por", key: "u", width: 22 },
    { header: "Fiscal", key: "fk", width: 12 },
    { header: "Moneda", key: "c", width: 10 },
    { header: "Importe", key: "v", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const e of expenses) {
    const row = sheet.addRow({
      f: dateFmt.format(e.date),
      cat: e.category.name,
      t: COST_KIND_LABELS[e.category.kind],
      d: e.description ?? "",
      mp: e.paymentMethod ?? "",
      o: e.opportunity
        ? `${e.opportunity.client.legalName} — ${e.opportunity.title}`
        : "General",
      u: e.createdBy.name ?? e.createdBy.email,
      fk: FISCAL_KIND_LABELS[e.fiscalKind],
      c: e.currency,
      v: Number(e.amount.toString()),
    });
    row.getCell("v").numFmt = MONEY_FMT;
  }

  // --- Hoja 4: Facturación del mes (detalle) -------------------------------
  const billing = workbook.addWorksheet("Facturación del mes");
  billing.columns = [
    { header: "Fecha", key: "f", width: 12 },
    { header: "Cliente", key: "cl", width: 30 },
    { header: "Tipo", key: "t", width: 16 },
    { header: "Comprobante", key: "r", width: 18 },
    { header: "Detalle", key: "d", width: 30 },
    { header: "Fiscal", key: "fk", width: 12 },
    { header: "Moneda", key: "c", width: 10 },
    { header: "Importe", key: "v", width: 16 },
  ];
  billing.getRow(1).font = { bold: true };
  for (const mv of movements) {
    const row = billing.addRow({
      f: dateFmt.format(mv.date),
      cl: mv.client.legalName,
      t: LEDGER_TYPE_LABELS[mv.type],
      r: mv.reference ?? "",
      d: mv.description ?? "",
      fk: FISCAL_KIND_LABELS[mv.fiscalKind],
      c: mv.currency,
      v: Number(mv.amount.toString()),
    });
    row.getCell("v").numFmt = MONEY_FMT;
  }

  await logAudit({
    action: "data.exported",
    actorId: user.id,
    targetType: "Export",
    metadata: { type: "balance", month },
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="balance-${month}.xlsx"`,
    },
  });
}

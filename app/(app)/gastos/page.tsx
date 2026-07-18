import Link from "next/link";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canLogExpenses,
  canManageExpenses,
  opportunityScope,
} from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import {
  COST_KIND_LABELS,
  FISCAL_KIND_LABELS,
  PAYMENT_METHODS,
  currentMonth,
  monthLabel,
  monthRange,
} from "@/lib/expenses";
import { Currency, CostKind, FiscalKind } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { TintBadge } from "@/components/tint-badge";
import {
  createExpense,
  deleteExpense,
  createExpenseCategory,
  toggleExpenseCategory,
} from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; cat?: string }>;
}) {
  const { m, cat } = await searchParams;
  const user = await requireActiveUser();
  if (!canLogExpenses(user)) redirect("/dashboard");
  const manager = canManageExpenses(user);

  const month = monthRange(m ?? "") ? (m as string) : currentMonth();
  const range = monthRange(month)!;

  const where = {
    date: { gte: range.gte, lt: range.lt },
    ...(cat ? { categoryId: cat } : {}),
    // Finanzas ve todo; el resto, solo lo que cargó.
    ...(manager ? {} : { createdById: user.id }),
  };

  const [expenses, categories, opportunities] = await Promise.all([
    prisma.expense.findMany({
      where,
      select: {
        id: true,
        date: true,
        amount: true,
        currency: true,
        paymentMethod: true,
        description: true,
        fiscalKind: true,
        receiptType: true,
        category: { select: { id: true, name: true, kind: true } },
        opportunity: {
          select: { id: true, title: true, client: { select: { legalName: true } } },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { date: "desc" },
      take: 200,
    }),
    prisma.expenseCategory.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    // Obras para asociar el gasto (las del alcance del usuario).
    prisma.opportunity.findMany({
      where: opportunityScope(user),
      select: { id: true, title: true, client: { select: { legalName: true } } },
      orderBy: { updatedAt: "desc" },
      take: 60,
    }),
  ]);

  const activeCategories = categories.filter((c) => c.isActive);

  // Totales del mes por moneda (Decimal; ARS y USD nunca se suman entre sí).
  const totals = new Map<string, { total: Decimal; fixed: Decimal; variable: Decimal }>();
  for (const e of expenses) {
    const entry =
      totals.get(e.currency) ??
      { total: new Decimal(0), fixed: new Decimal(0), variable: new Decimal(0) };
    const amount = new Decimal(e.amount.toString());
    entry.total = entry.total.plus(amount);
    if (e.category.kind === CostKind.FIXED) entry.fixed = entry.fixed.plus(amount);
    else entry.variable = entry.variable.plus(amount);
    totals.set(e.currency, entry);
  }

  // Navegación de mes (anterior / siguiente).
  const [y, mm] = month.split("-").map(Number);
  const prev = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`;
  const next = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  const monthHref = (target: string) =>
    `/gastos?m=${target}${cat ? `&cat=${cat}` : ""}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Gastos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {manager
              ? "Todos los gastos de la empresa."
              : "Tus gastos cargados (combustible, viáticos, obra)."}{" "}
            {manager && (
              <Link href="/finanzas" className="font-medium text-primary hover:underline">
                Ver balance mensual →
              </Link>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={monthHref(prev)}>
            <Button variant="outline" size="sm">←</Button>
          </Link>
          <span className="min-w-[130px] text-center font-semibold capitalize">
            {monthLabel(month)}
          </span>
          <Link href={monthHref(next)}>
            <Button variant="outline" size="sm">→</Button>
          </Link>
        </div>
      </div>

      {/* Totales del mes */}
      <div className="grid gap-[14px] sm:grid-cols-2">
        {[...totals.entries()].map(([currency, t]) => (
          <section key={currency} className="rounded-[12px] border bg-card p-5">
            <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              Total {currency} del mes
            </h2>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatMoney(t.total.toFixed(2), currency as Currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Fijos {formatMoney(t.fixed.toFixed(2), currency as Currency)} · Variables{" "}
              {formatMoney(t.variable.toFixed(2), currency as Currency)}
            </p>
          </section>
        ))}
        {totals.size === 0 && (
          <section className="rounded-[12px] border bg-card p-5 text-sm text-muted-foreground">
            Sin gastos cargados en {monthLabel(month)}.
          </section>
        )}
      </div>

      {/* Carga rápida */}
      <section className="rounded-[12px] border bg-card p-5">
        <h2 className="mb-4 text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
          Registrar gasto
        </h2>
        <form action={createExpense} className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Fecha</span>
            <input type="date" name="date" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Importe *</span>
            <input name="amount" required inputMode="decimal" placeholder="25000" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Moneda</span>
            <select name="currency" defaultValue={Currency.ARS} className={inputClass}>
              <option value={Currency.ARS}>Pesos (ARS)</option>
              <option value={Currency.USD}>Dólares (USD)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Categoría *</span>
            <select name="categoryId" required className={inputClass}>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({COST_KIND_LABELS[c.kind]})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Medio de pago</span>
            <select name="paymentMethod" defaultValue="" className={inputClass}>
              <option value="">Sin especificar</option>
              {PAYMENT_METHODS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Obra (opcional)</span>
            <select name="opportunityId" defaultValue="" className={inputClass}>
              <option value="">Gasto general (sin obra)</option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.client.legalName} — {o.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Detalle</span>
            <input name="description" placeholder="Ej: nafta gira San Rafael" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Comprobante fiscal</span>
            <select name="fiscalKind" defaultValue={FiscalKind.INVOICED} className={inputClass}>
              <option value={FiscalKind.INVOICED}>Facturado</option>
              <option value={FiscalKind.INTERNAL}>Sin factura (interno)</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Adjuntar comprobante (foto o PDF, hasta 800 KB)
            </span>
            <input type="file" name="receipt" accept="image/jpeg,image/png,image/webp,application/pdf" className={inputClass} />
          </label>
          <div className="flex items-end justify-end">
            <Button type="submit">Registrar gasto</Button>
          </div>
        </form>
      </section>

      {/* Filtro por categoría */}
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={`/gastos?m=${month}`}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${!cat ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-hoverbg"}`}
        >
          Todas
        </Link>
        {categories
          .filter((c) => c.isActive)
          .map((c) => (
            <Link
              key={c.id}
              href={`/gastos?m=${month}&cat=${c.id}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${cat === c.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-hoverbg"}`}
            >
              {c.name}
            </Link>
          ))}
      </div>

      {/* Lista del mes */}
      <section className="overflow-hidden rounded-[12px] border bg-card">
        <div className="grid grid-cols-[100px_1.4fr_1fr_1fr_120px_90px_60px] items-center border-b border-border2 bg-card2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          <span>Fecha</span>
          <span>Categoría / detalle</span>
          <span>Obra</span>
          <span>Cargado por</span>
          <span className="text-right">Importe</span>
          <span className="text-center">Fiscal</span>
          <span />
        </div>
        {expenses.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Sin gastos en este mes{cat ? " para esa categoría" : ""}.
          </div>
        ) : (
          expenses.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[100px_1.4fr_1fr_1fr_120px_90px_60px] items-center border-b border-border2 px-5 py-3 text-[13px] last:border-0 hover:bg-hoverbg"
            >
              <span className="tabular-nums text-text2">
                {e.date.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
              </span>
              <span className="min-w-0 pr-2">
                <span className="font-semibold">{e.category.name}</span>
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  {COST_KIND_LABELS[e.category.kind]}
                </span>
                {e.description && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {e.description}
                    {e.paymentMethod ? ` · ${e.paymentMethod}` : ""}
                  </span>
                )}
              </span>
              <span className="min-w-0 truncate pr-2 text-text2">
                {e.opportunity ? (
                  <Link href={`/oportunidades/${e.opportunity.id}`} className="hover:underline">
                    {e.opportunity.client.legalName} — {e.opportunity.title}
                  </Link>
                ) : (
                  <span className="text-muted2">General</span>
                )}
              </span>
              <span className="min-w-0 truncate pr-2 text-text2">
                {e.createdBy.name ?? e.createdBy.email}
              </span>
              <span className="text-right font-semibold tabular-nums">
                {formatMoney(e.amount.toString(), e.currency)}
              </span>
              <span className="text-center">
                <TintBadge variant={e.fiscalKind === FiscalKind.INVOICED ? "blue" : "amber"}>
                  {FISCAL_KIND_LABELS[e.fiscalKind]}
                </TintBadge>
              </span>
              <span className="flex items-center justify-end gap-2">
                {e.receiptType && (
                  <a
                    href={`/gastos/${e.id}/comprobante`}
                    target="_blank"
                    title="Ver comprobante"
                    className="text-muted-foreground hover:text-primary"
                  >
                    📎
                  </a>
                )}
                {(manager || e.createdBy.id === user.id) && (
                  <form action={deleteExpense}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" title="Borrar" className="text-zinc-400 hover:text-red-600">
                      ✕
                    </button>
                  </form>
                )}
              </span>
            </div>
          ))
        )}
      </section>

      {/* Categorías (solo finanzas) */}
      {manager && (
        <details className="rounded-[12px] border bg-card p-5">
          <summary className="cursor-pointer text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
            Categorías de costo ({categories.length})
          </summary>
          <div className="mt-4 space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-sm">
                <span className={`min-w-0 flex-1 ${c.isActive ? "" : "text-muted2 line-through"}`}>
                  {c.name}
                </span>
                <TintBadge variant={c.kind === CostKind.FIXED ? "blue" : "green"}>
                  {COST_KIND_LABELS[c.kind]}
                </TintBadge>
                <form action={toggleExpenseCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="text-xs text-muted-foreground hover:underline">
                    {c.isActive ? "Desactivar" : "Reactivar"}
                  </button>
                </form>
              </div>
            ))}
          </div>
          <form action={createExpenseCategory} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border2 pt-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Nueva categoría</span>
              <input name="name" required placeholder="Ej: Publicidad" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Tipo</span>
              <select name="kind" defaultValue={CostKind.VARIABLE} className={inputClass}>
                <option value={CostKind.FIXED}>Fijo</option>
                <option value={CostKind.VARIABLE}>Variable</option>
              </select>
            </label>
            <Button type="submit" variant="outline">Agregar</Button>
          </form>
        </details>
      )}
    </div>
  );
}

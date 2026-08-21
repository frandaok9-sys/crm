import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canLogExpenses,
  canManageExpenses,
  canAccessSensitiveAccounting,
  opportunityScope,
} from "@/lib/permissions";
import { COST_KIND_LABELS, PAYMENT_METHODS } from "@/lib/expenses";
import { formatMoney } from "@/lib/opportunities";
import { AR_TIME_ZONE } from "@/lib/dates";
import { Currency, FiscalKind } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { ExpenseBreakdown } from "@/components/expense-breakdown";
import { PersonSelect } from "@/components/person-select";
import { updateExpense } from "../../actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

/** Editar un gasto ya cargado (completar datos faltantes). */
export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireActiveUser();
  if (!canLogExpenses(user)) redirect("/dashboard");
  // Zona reservada (nominal): desglose impositivo y persona del listado.
  const sensitive = canAccessSensitiveAccounting(user);

  const expense = await prisma.expense.findUnique({
    where: { id },
    select: {
      id: true,
      date: true,
      amount: true,
      netAmount: true,
      currency: true,
      categoryId: true,
      paymentMethod: true,
      description: true,
      fiscalKind: true,
      opportunityId: true,
      personId: true,
      receiptType: true,
      createdById: true,
      createdBy: { select: { name: true, email: true } },
      taxes: { select: { label: true, amount: true } },
    },
  });
  if (!expense) notFound();
  // Misma regla que el borrado: el autor, o quien gestiona finanzas.
  if (expense.createdById !== user.id && !canManageExpenses(user)) {
    redirect("/contabilidad/gastos");
  }

  const [categories, opportunities, currentOpp, people] = await Promise.all([
    prisma.expenseCategory.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    prisma.opportunity.findMany({
      where: opportunityScope(user),
      select: { id: true, title: true, client: { select: { legalName: true } } },
      orderBy: { updatedAt: "desc" },
      take: 60,
    }),
    // La obra actual puede estar fuera del alcance de quien edita: se incluye.
    expense.opportunityId
      ? prisma.opportunity.findUnique({
          where: { id: expense.opportunityId },
          select: { id: true, title: true, client: { select: { legalName: true } } },
        })
      : null,
    // Personal activo + la persona actual del gasto aunque esté dada de baja
    // (solo se muestra en la zona reservada).
    sensitive
      ? prisma.person.findMany({
          where: expense.personId
            ? { OR: [{ isActive: true }, { id: expense.personId }] }
            : { isActive: true },
          select: { id: true, name: true, area: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Categorías activas + la actual del gasto aunque esté desactivada.
  const selectableCategories = categories.filter(
    (c) => c.isActive || c.id === expense.categoryId
  );
  const oppOptions = currentOpp
    ? [currentOpp, ...opportunities.filter((o) => o.id !== currentOpp.id)]
    : opportunities;

  // input[type=date] espera yyyy-mm-dd, en fecha ARGENTINA (no UTC).
  const dateValue = expense.date.toLocaleDateString("en-CA", {
    timeZone: AR_TIME_ZONE,
  });

  // Valores en formato argentino para los campos.
  const ar = (v: { toString(): string }) =>
    Number(v.toString()).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const hasBreakdown = expense.taxes.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link
          href="/contabilidad/gastos"
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Volver a gastos
        </Link>
        <h1 className="mt-2 text-[26px] font-semibold leading-tight">
          Editar gasto
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cargado por {expense.createdBy.name ?? expense.createdBy.email}.
          Completá o corregí lo que falte y guardá.
        </p>
      </div>

      <section className="rounded-[12px] border bg-card p-5">
        <form action={updateExpense} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="id" value={expense.id} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Fecha *</span>
            <input
              type="date"
              name="date"
              required
              defaultValue={dateValue}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Moneda</span>
            <select name="currency" defaultValue={expense.currency} className={inputClass}>
              <option value={Currency.ARS}>Pesos (ARS)</option>
              <option value={Currency.USD}>Dólares (USD)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Categoría *</span>
            <select
              name="categoryId"
              required
              defaultValue={expense.categoryId}
              className={inputClass}
            >
              {selectableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({COST_KIND_LABELS[c.kind]})
                  {c.isActive ? "" : " — desactivada"}
                </option>
              ))}
            </select>
          </label>

          {/* Importe: desglose completo en la zona reservada; si no, total. */}
          {sensitive ? (
            <ExpenseBreakdown
              symbol=""
              defaultNet={ar(expense.netAmount)}
              defaultTaxes={expense.taxes.map((t) => ({
                label: t.label,
                amount: ar(t.amount),
              }))}
            />
          ) : hasBreakdown ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Importe total</span>
              <input
                value={formatMoney(expense.amount.toString(), expense.currency) ?? ""}
                disabled
                className={`${inputClass} opacity-70`}
              />
              <span className="mt-1 block text-[11px] text-zinc-400">
                Este gasto tiene desglose impositivo cargado por Administración:
                el importe se conserva.
              </span>
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Importe total *</span>
              <input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={ar(expense.amount)}
                className={inputClass}
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Medio de pago</span>
            <select
              name="paymentMethod"
              defaultValue={expense.paymentMethod ?? ""}
              className={inputClass}
            >
              <option value="">Sin especificar</option>
              {PAYMENT_METHODS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          {sensitive && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Persona (quién gastó / sueldo de)
              </span>
              <PersonSelect people={people} defaultValue={expense.personId ?? ""} />
              <span className="mt-1 block text-[11px] text-zinc-400">
                Obligatorio para sueldos.
              </span>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Obra (opcional)</span>
            <select
              name="opportunityId"
              defaultValue={expense.opportunityId ?? ""}
              className={inputClass}
            >
              <option value="">Gasto general (sin obra)</option>
              {oppOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.client.legalName} — {o.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Detalle</span>
            <input
              name="description"
              defaultValue={expense.description ?? ""}
              placeholder="Ej: nafta gira San Rafael"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Comprobante fiscal</span>
            <select name="fiscalKind" defaultValue={expense.fiscalKind} className={inputClass}>
              <option value={FiscalKind.INVOICED}>Facturado</option>
              <option value={FiscalKind.INTERNAL}>Sin factura (interno)</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              {expense.receiptType
                ? "Reemplazar comprobante (foto o PDF, hasta 800 KB)"
                : "Adjuntar comprobante (foto o PDF, hasta 800 KB)"}
            </span>
            <input
              type="file"
              name="receipt"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className={inputClass}
            />
            {expense.receiptType && (
              <span className="mt-1 block text-[11px] text-zinc-400">
                Ya tiene un comprobante adjunto (
                <a
                  href={`/contabilidad/gastos/${expense.id}/comprobante`}
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  verlo 📎
                </a>
                ). Si no subís nada, se conserva.
              </span>
            )}
          </label>
          <div className="flex items-end justify-end gap-3 sm:col-span-3">
            <Link href="/contabilidad/gastos">
              <Button type="button" variant="outline">Cancelar</Button>
            </Link>
            <Button type="submit">Guardar cambios</Button>
          </div>
        </form>
      </section>
    </div>
  );
}

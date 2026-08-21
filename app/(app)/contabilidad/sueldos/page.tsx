import Link from "next/link";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canAccessSensitiveAccounting } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import {
  STAFF_AREA_LABELS,
  isSalaryCategory,
  currentMonth,
  monthLabel,
  monthRange,
} from "@/lib/expenses";
import { formatDateAR } from "@/lib/dates";
import { Currency } from "@/lib/generated/prisma/enums";
import { TintBadge } from "@/components/tint-badge";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

type Totals = Map<string, Decimal>; // moneda → total

function addTo(map: Totals, currency: string, amount: { toString(): string }) {
  map.set(currency, (map.get(currency) ?? new Decimal(0)).plus(amount.toString()));
}

function renderTotals(map: Totals) {
  if (map.size === 0) return <span className="text-muted2">—</span>;
  return [...map.entries()]
    .sort()
    .map(([cur, v]) => (
      <span key={cur} className="block">
        {formatMoney(v.toFixed(2), cur === "USD" ? Currency.USD : Currency.ARS)}
      </span>
    ));
}

/**
 * Sueldos (M5): buscador por persona con cuánto se le pagó (mes elegido y
 * acumulado) y el detalle de cada pago. Los pagos son gastos de categoría
 * "Sueldos" (o similar) con la persona indicada — se cargan desde Gastos.
 */
export default async function SueldosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string; m?: string }>;
}) {
  const { q, p, m } = await searchParams;
  const user = await requireActiveUser();
  if (!canAccessSensitiveAccounting(user)) redirect("/contabilidad");

  const month = monthRange(m ?? "") ? (m as string) : currentMonth();
  const range = monthRange(month)!;
  const query = (q ?? "").trim();

  // Solo categorías de sueldos (el nombre manda: "Sueldos", "Jornales"…).
  const categories = await prisma.expenseCategory.findMany({
    select: { id: true, name: true },
  });
  const salaryCategoryIds = categories
    .filter((c) => isSalaryCategory(c.name))
    .map((c) => c.id);

  const people = await prisma.person.findMany({
    where: query ? { name: { contains: query, mode: "insensitive" } } : {},
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, area: true, isActive: true },
  });

  // Pagos de sueldo de las personas listadas (acumulado) — se suman en memoria
  // con Decimal por moneda; ARS y USD nunca se mezclan.
  const payments = await prisma.expense.findMany({
    where: {
      personId: { in: people.map((x) => x.id) },
      categoryId: { in: salaryCategoryIds },
    },
    select: {
      id: true,
      personId: true,
      date: true,
      amount: true,
      currency: true,
      description: true,
      paymentMethod: true,
      category: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { date: "desc" },
  });

  const allTime = new Map<string, Totals>();
  const thisMonth = new Map<string, Totals>();
  for (const pay of payments) {
    if (!pay.personId) continue;
    const a = allTime.get(pay.personId) ?? new Map<string, Decimal>();
    addTo(a, pay.currency, pay.amount);
    allTime.set(pay.personId, a);
    if (pay.date >= range.gte && pay.date < range.lt) {
      const t = thisMonth.get(pay.personId) ?? new Map<string, Decimal>();
      addTo(t, pay.currency, pay.amount);
      thisMonth.set(pay.personId, t);
    }
  }

  const selected = p ? people.find((x) => x.id === p) ?? null : null;
  const selectedPayments = selected
    ? payments.filter((x) => x.personId === selected.id)
    : [];
  const selectedTotal = new Map<string, Decimal>();
  for (const pay of selectedPayments) addTo(selectedTotal, pay.currency, pay.amount);

  // Navegación de mes.
  const [y, mm] = month.split("-").map(Number);
  const prev = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`;
  const next = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  const href = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q: query || undefined, p, m: month, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/contabilidad/sueldos?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Sueldos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuánto se le pagó a cada persona. Los pagos se registran desde{" "}
            <Link href="/contabilidad/gastos" className="font-medium text-primary hover:underline">
              Gastos
            </Link>{" "}
            con la categoría Sueldos y la persona.
            {salaryCategoryIds.length === 0 && (
              <span className="text-amber-600"> No hay una categoría de sueldos activa.</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={href({ m: prev })} className="rounded-[9px] border border-border px-2.5 py-1.5 hover:bg-hoverbg">←</Link>
          <span className="min-w-[130px] text-center font-semibold capitalize">
            {monthLabel(month)}
          </span>
          <Link href={href({ m: next })} className="rounded-[9px] border border-border px-2.5 py-1.5 hover:bg-hoverbg">→</Link>
        </div>
      </div>

      {/* Buscador por persona */}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="m" value={month} />
        <input
          name="q"
          defaultValue={query}
          placeholder="Buscar persona por nombre…"
          className={`${inputClass} w-full max-w-[360px]`}
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Buscar
        </button>
        {query && (
          <Link href={href({ q: undefined, p: undefined })} className="text-sm text-muted-foreground hover:underline">
            Limpiar
          </Link>
        )}
      </form>

      <div className="grid gap-[14px] lg:grid-cols-[1.1fr_1fr]">
        {/* Listado de personas con totales */}
        <section className="overflow-x-auto rounded-[12px] border bg-card">
          <div className="grid min-w-[560px] grid-cols-[1.6fr_1fr_1fr] items-center lg:min-w-0 border-b border-border2 bg-card2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            <span>Persona</span>
            <span className="text-right capitalize">{monthLabel(month)}</span>
            <span className="text-right">Acumulado</span>
          </div>
          {people.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {query
                ? `Nadie coincide con "${query}".`
                : "Todavía no hay personal cargado (Contabilidad → Personal)."}
            </div>
          ) : (
            people.map((person) => (
              <Link
                key={person.id}
                href={href({ p: person.id })}
                className={`grid min-w-[560px] grid-cols-[1.6fr_1fr_1fr] items-center lg:min-w-0 border-b border-border2 px-5 py-3 text-[13px] last:border-0 hover:bg-hoverbg ${
                  selected?.id === person.id ? "bg-primary/5" : ""
                }`}
              >
                <span className="min-w-0 pr-2">
                  <span className={`block truncate font-semibold ${person.isActive ? "" : "line-through text-muted2"}`}>
                    {person.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {STAFF_AREA_LABELS[person.area]}
                    {!person.isActive && " · de baja"}
                  </span>
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {renderTotals(thisMonth.get(person.id) ?? new Map())}
                </span>
                <span className="text-right tabular-nums text-text2">
                  {renderTotals(allTime.get(person.id) ?? new Map())}
                </span>
              </Link>
            ))
          )}
        </section>

        {/* Detalle de la persona elegida */}
        <section className="rounded-[12px] border bg-card p-5">
          {!selected ? (
            <p className="text-sm text-muted-foreground">
              Elegí una persona de la lista para ver el detalle de sus pagos.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {STAFF_AREA_LABELS[selected.area]} · {selectedPayments.length} pago(s)
                  </p>
                </div>
                <div className="text-right">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                    Total pagado
                  </span>
                  <span className="font-bold tabular-nums">{renderTotals(selectedTotal)}</span>
                </div>
              </div>
              {selectedPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin pagos de sueldo registrados.</p>
              ) : (
                <ul className="divide-y divide-border2">
                  {selectedPayments.map((pay) => (
                    <li key={pay.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="w-[84px] shrink-0 tabular-nums text-text2">
                        {formatDateAR(pay.date)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {pay.description || pay.category.name}
                          {pay.paymentMethod ? ` · ${pay.paymentMethod}` : ""}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          Cargado por {pay.createdBy.name ?? pay.createdBy.email}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatMoney(pay.amount.toString(), pay.currency)}
                      </span>
                      <Link
                        href={`/contabilidad/gastos/${pay.id}/editar`}
                        title="Editar"
                        className="text-muted-foreground hover:text-primary"
                      >
                        ✎
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <TintBadge variant="gray">Datos de Gastos · categoría Sueldos</TintBadge>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

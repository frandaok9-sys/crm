import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageExpenses } from "@/lib/permissions";
import { STAFF_AREA_LABELS, STAFF_AREA_ORDER } from "@/lib/expenses";
import { StaffArea } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { TintBadge } from "@/components/tint-badge";
import {
  createPerson,
  updatePerson,
  togglePersonCanSpend,
  togglePersonActive,
} from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

/**
 * Personal (M5): listado del personal separado por gerencia, administración
 * y empleados, con la marca de quiénes están autorizados a generar gastos.
 * Es también el padrón que usa Sueldos y el campo "Persona" de cada gasto.
 */
export default async function PersonalPage() {
  const user = await requireActiveUser();
  if (!canManageExpenses(user)) redirect("/contabilidad");

  const people = await prisma.person.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const authorized = people.filter((p) => p.isActive && p.canSpend).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight">Personal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {people.length === 0
            ? "Todavía no hay personal cargado. El listado queda previsto para cuando lo completen."
            : `${people.filter((p) => p.isActive).length} persona(s) activa(s) · ${authorized} autorizada(s) a generar gastos.`}
        </p>
      </div>

      {/* Alta */}
      <section className="rounded-[12px] border bg-card p-5">
        <h2 className="mb-4 text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
          Agregar persona
        </h2>
        <form action={createPerson} className="grid gap-3 sm:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Nombre y apellido *</span>
            <input name="name" required placeholder="Ej: Juan Pérez" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Área</span>
            <select name="area" defaultValue={StaffArea.EMPLOYEE} className={inputClass}>
              {STAFF_AREA_ORDER.map((a) => (
                <option key={a} value={a}>{STAFF_AREA_LABELS[a]}</option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="canSpend" className="h-4 w-4" />
            Autorizado a gastar
          </label>
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Notas (opcional)</span>
            <input name="notes" placeholder="Ej: tope mensual, tarjeta corporativa…" className={inputClass} />
          </label>
          <div className="flex items-end justify-end">
            <Button type="submit">Agregar</Button>
          </div>
        </form>
      </section>

      {/* Listado por área */}
      {STAFF_AREA_ORDER.map((area) => {
        const group = people.filter((p) => p.area === area);
        return (
          <section key={area} className="rounded-[12px] border bg-card">
            <div className="flex items-center justify-between border-b border-border2 px-5 py-3">
              <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
                {STAFF_AREA_LABELS[area]}
              </h2>
              <span className="text-xs text-muted-foreground">
                {group.filter((p) => p.isActive).length} activa(s)
              </span>
            </div>
            {group.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Sin personas en {STAFF_AREA_LABELS[area].toLowerCase()} todavía.
              </p>
            ) : (
              <ul className="divide-y divide-border2">
                {group.map((p) => (
                  <li
                    key={p.id}
                    className={`flex flex-wrap items-center gap-3 px-5 py-3 text-sm ${p.isActive ? "" : "opacity-60"}`}
                  >
                    {/* Renombrar / cambiar área / notas en línea */}
                    <form action={updatePerson} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        name="name"
                        defaultValue={p.name}
                        required
                        className={`${inputClass} w-auto min-w-[180px] flex-1`}
                      />
                      <select name="area" defaultValue={p.area} className={`${inputClass} w-auto`}>
                        {STAFF_AREA_ORDER.map((a) => (
                          <option key={a} value={a}>{STAFF_AREA_LABELS[a]}</option>
                        ))}
                      </select>
                      <input
                        name="notes"
                        defaultValue={p.notes ?? ""}
                        placeholder="Notas"
                        className={`${inputClass} w-auto min-w-[140px] flex-1`}
                      />
                      <button type="submit" className="text-xs font-medium text-primary hover:underline">
                        Guardar
                      </button>
                    </form>
                    <form action={togglePersonCanSpend}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" title="Cambiar autorización para gastar">
                        <TintBadge variant={p.canSpend ? "green" : "gray"}>
                          {p.canSpend ? "Autorizado a gastar" : "No autorizado"}
                        </TintBadge>
                      </button>
                    </form>
                    <form action={togglePersonActive}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-xs text-muted-foreground hover:underline">
                        {p.isActive ? "Dar de baja" : "Reincorporar"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

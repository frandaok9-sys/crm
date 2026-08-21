import { STAFF_AREA_LABELS, STAFF_AREA_ORDER } from "@/lib/expenses";
import type { StaffArea } from "@/lib/generated/prisma/enums";

export type PersonOption = { id: string; name: string; area: StaffArea };

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

/**
 * Selector de persona del listado de personal (M5), agrupado por área.
 * Para sueldos es obligatorio (el servidor lo exige); para el resto indica
 * quién generó el gasto.
 */
export function PersonSelect({
  people,
  defaultValue = "",
  name = "personId",
}: {
  people: PersonOption[];
  defaultValue?: string;
  name?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={inputClass}>
      <option value="">Sin persona asignada</option>
      {STAFF_AREA_ORDER.map((area) => {
        const group = people.filter((p) => p.area === area);
        if (group.length === 0) return null;
        return (
          <optgroup key={area} label={STAFF_AREA_LABELS[area]}>
            {group.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

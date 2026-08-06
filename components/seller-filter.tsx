"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export type SellerOption = { id: string; label: string; count: number };

/**
 * Filtro por vendedor del pipeline (solo admins/gerentes): desplegable que
 * navega con ?v=<id> — el filtrado real ocurre en el servidor.
 */
export function SellerFilter({
  sellers,
  unassignedCount,
  total,
  current,
}: {
  sellers: SellerOption[];
  unassignedCount: number;
  total: number;
  current: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    startTransition(() => {
      router.push(value ? `/oportunidades?v=${value}` : "/oportunidades");
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        Vendedor
      </span>
      <select
        value={current ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="rounded-[8px] border border-border bg-field px-3 py-1.5 text-[13px] disabled:opacity-60"
      >
        <option value="">Todos · {total}</option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label} · {s.count}
          </option>
        ))}
        {unassignedCount > 0 && (
          <option value="none">Sin asignar · {unassignedCount}</option>
        )}
      </select>
    </label>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export type SellerOption = { id: string; label: string; count?: number };

/**
 * Filtro por vendedor/usuario (solo admins/gerentes): desplegable que navega
 * con ?v=<id> — el filtrado real ocurre en el servidor. Reutilizable: el
 * pipeline lo usa con conteos y Métricas sin conteos.
 */
export function SellerFilter({
  sellers,
  unassignedCount = 0,
  total,
  current,
  basePath = "/oportunidades",
  label = "Vendedor",
  allValue = "",
}: {
  sellers: SellerOption[];
  unassignedCount?: number;
  total?: number;
  current: string | null;
  basePath?: string;
  label?: string;
  /**
   * Valor explícito para "Todos". Con "" (default) elegir Todos navega sin
   * parámetro; con p. ej. "all" navega a ?v=all — necesario cuando la vista
   * SIN parámetro no es la general (Inicio/Métricas arrancan en "lo mío").
   */
  allValue?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    startTransition(() => {
      router.push(value ? `${basePath}?v=${value}` : basePath);
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <select
        value={current ?? allValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="rounded-[8px] border border-border bg-field px-3 py-1.5 text-[13px] disabled:opacity-60"
      >
        <option value={allValue}>
          Todos{total !== undefined ? ` · ${total}` : ""}
        </option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.count !== undefined ? ` · ${s.count}` : ""}
          </option>
        ))}
        {unassignedCount > 0 && (
          <option value="none">Sin asignar · {unassignedCount}</option>
        )}
      </select>
    </label>
  );
}

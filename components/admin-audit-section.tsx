"use client";

import { useState, useTransition } from "react";

import { AUDIT_CATEGORIES, type AuditFilters, type AuditPage } from "@/lib/audit-shared";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/initials-avatar";
import { fetchAuditLog } from "@/app/(app)/admin/actions";

type UserOption = { id: string; label: string };

const GRID = "grid grid-cols-[minmax(84px,0.7fr)_1.3fr_1.5fr_1fr_1.4fr] items-center";
const SELECT =
  "rounded-[8px] border border-border bg-field px-2.5 py-2 text-[13px] outline-none focus:border-muted-foreground";

export function AdminAuditSection({
  users,
  initial,
}: {
  users: UserOption[];
  initial: AuditPage;
}) {
  const [data, setData] = useState<AuditPage>(initial);
  const [filters, setFilters] = useState<AuditFilters>({ page: 1 });
  const [isPending, startTransition] = useTransition();

  function apply(next: AuditFilters) {
    setFilters(next);
    startTransition(async () => {
      setData(await fetchAuditLog(next));
    });
  }

  function setField(field: keyof AuditFilters, value: string) {
    apply({ ...filters, [field]: value || undefined, page: 1 });
  }

  function goToPage(page: number) {
    apply({ ...filters, page });
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Usuario
          <select
            className={SELECT}
            value={filters.actorId ?? ""}
            onChange={(e) => setField("actorId", e.target.value)}
          >
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Categoría
          <select
            className={SELECT}
            value={filters.category ?? ""}
            onChange={(e) => setField("category", e.target.value)}
          >
            <option value="">Todas</option>
            {AUDIT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Desde
          <input
            type="date"
            className={SELECT}
            value={filters.desde ?? ""}
            onChange={(e) => setField("desde", e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Hasta
          <input
            type="date"
            className={SELECT}
            value={filters.hasta ?? ""}
            onChange={(e) => setField("hasta", e.target.value)}
          />
        </label>

        {(filters.actorId || filters.category || filters.desde || filters.hasta) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => apply({ page: 1 })}
            className="text-muted-foreground"
          >
            Limpiar
          </Button>
        )}
      </div>

      {/* Tabla */}
      <section className="overflow-hidden rounded-[12px] border bg-card">
        <div
          className={`${GRID} border-b border-border2 bg-card2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground`}
        >
          <span>Fecha</span>
          <span>Usuario</span>
          <span>Acción</span>
          <span>Entidad</span>
          <span>Detalle</span>
        </div>

        {data.entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No hay registros para ese filtro.
          </div>
        ) : (
          data.entries.map((e) => (
            <div
              key={e.id}
              className={`${GRID} border-b border-border2 px-5 py-[11px] text-[13px] transition-colors last:border-0 hover:bg-hoverbg ${
                isPending ? "opacity-50" : ""
              }`}
            >
              <span className="tabular-nums text-muted-foreground">{e.fecha}</span>
              <span className="flex min-w-0 items-center gap-2 pr-2">
                <InitialsAvatar name={e.actor} size={22} />
                <span className="truncate text-text2">{e.actor}</span>
              </span>
              <span className="truncate pr-2 font-medium text-text1">
                {e.actionLabel}
              </span>
              <span className="truncate pr-2 text-muted-foreground">
                {e.entidad ?? "—"}
              </span>
              <span className="truncate text-muted-foreground" title={e.detalle ?? ""}>
                {e.detalle ?? "—"}
              </span>
            </div>
          ))
        )}
      </section>

      {/* Paginación */}
      <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
        <span className="tabular-nums">
          {data.total} registro(s) · página {data.page} de {data.pages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1 || isPending}
            onClick={() => goToPage(data.page - 1)}
          >
            ← Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= data.pages || isPending}
            onClick={() => goToPage(data.page + 1)}
          >
            Siguiente →
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  portfolioSummary,
  reassignPortfolio,
  type PortfolioCounts,
} from "@/app/(app)/admin/actions";

type UserOption = { id: string; label: string };

const SELECT =
  "w-full rounded-[8px] border border-border bg-field px-3 py-2.5 text-[13.5px] outline-none focus:border-muted-foreground";

export function AdminReassignSection({ users }: { users: UserOption[] }) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [summary, setSummary] = useState<PortfolioCounts | null>(null);
  const [done, setDone] = useState<PortfolioCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = summary
    ? summary.clients + summary.opportunities + summary.quotes
    : 0;

  function onFrom(id: string) {
    setFromId(id);
    setSummary(null);
    setDone(null);
    setError(null);
    if (!id) return;
    startTransition(async () => {
      try {
        setSummary(await portfolioSummary(id));
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function confirm() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const moved = await reassignPortfolio(fromId, toId);
        setDone(moved);
        setSummary(null);
        setFromId("");
        setToId("");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const fromLabel = users.find((u) => u.id === fromId)?.label ?? "";
  const toLabel = users.find((u) => u.id === toId)?.label ?? "";
  const canConfirm = fromId && toId && fromId !== toId && total > 0 && !isPending;

  return (
    <div className="max-w-[560px] space-y-5">
      <p className="text-sm text-muted-foreground">
        Transferí toda la cartera de un vendedor a otro (clientes, oportunidades
        y presupuestos) de una sola vez. Útil cuando alguien deja el equipo o se
        redistribuyen cuentas.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Mover cartera de…
          <select className={SELECT} value={fromId} onChange={(e) => onFrom(e.target.value)}>
            <option value="">Elegí un vendedor</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          …hacia
          <select
            className={SELECT}
            value={toId}
            onChange={(e) => {
              setToId(e.target.value);
              setDone(null);
              setError(null);
            }}
          >
            <option value="">Elegí un vendedor</option>
            {users
              .filter((u) => u.id !== fromId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
          </select>
        </label>
      </div>

      {summary && (
        <div className="rounded-[12px] border bg-card2 p-4">
          <p className="text-[13px] text-text2">
            <b>{fromLabel}</b> tiene en su cartera:
          </p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px]">
            <span>
              <b className="tabular-nums">{summary.clients}</b> clientes
            </span>
            <span>
              <b className="tabular-nums">{summary.opportunities}</b> oportunidades
            </span>
            <span>
              <b className="tabular-nums">{summary.quotes}</b> presupuestos
            </span>
          </div>
          {total === 0 && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Este vendedor no tiene nada asignado — no hay nada para mover.
            </p>
          )}
        </div>
      )}

      {canConfirm && (
        <div className="flex items-center gap-3 rounded-[10px] border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="flex-1 text-[13px] text-text1">
            Vas a mover <b>{total}</b> registro(s) de <b>{fromLabel}</b> a{" "}
            <b>{toLabel}</b>. Esta acción queda registrada en la auditoría.
          </p>
          <Button size="cta" onClick={confirm} disabled={isPending}>
            {isPending ? "Moviendo…" : "Reasignar"}
          </Button>
        </div>
      )}

      {done && (
        <div className="rounded-[10px] border border-[#4FA97A]/35 bg-[#4FA97A]/10 px-4 py-3 text-[13px] text-text1">
          ✓ Cartera reasignada: {done.clients} clientes, {done.opportunities}{" "}
          oportunidades y {done.quotes} presupuestos.
        </div>
      )}

      {error && (
        <div className="rounded-[10px] border border-destructive/35 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

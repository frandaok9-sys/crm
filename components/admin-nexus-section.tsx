"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { TintBadge, type TintVariant } from "@/components/tint-badge";
import { createTenantAction } from "@/app/(app)/admin/actions";

export type TenantHealthRow = {
  id: string;
  name: string;
  cuit: string;
  via: string;
  status: string;
  clients: number;
  opportunities: number;
  quotes: number;
  lastSync: string | null;
  errors24h: number;
};

export type SyncRow = {
  id: string;
  fecha: string;
  tenant: string;
  entity: string;
  direction: string;
  result: string;
  detail: string | null;
};

const INPUT =
  "rounded-[8px] border border-border bg-field px-2.5 py-2 text-[13px] outline-none focus:border-muted-foreground";

const STATUS_META: Record<string, { label: string; variant: TintVariant }> = {
  ACTIVE: { label: "Activa", variant: "green" },
  ONBOARDING: { label: "Onboarding", variant: "amber" },
  SUSPENDED: { label: "Suspendida", variant: "gray" },
};

const VIA_LABEL: Record<string, string> = {
  A: "Vía A · CRM directo",
  B: "Vía B · sistema propio (n8n)",
  C: "Vía C · otro CRM (API)",
};

const RESULT_VARIANT: Record<string, TintVariant> = {
  OK: "green",
  SKIPPED: "gray",
  ERROR: "red",
};

export function AdminNexusSection({
  health,
  syncLog,
}: {
  health: TenantHealthRow[];
  syncLog: SyncRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [cuit, setCuit] = useState("");
  const [via, setVia] = useState("A");

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        await createTenantAction(name, cuit, via);
        setName("");
        setCuit("");
        setVia("A");
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        La central: cada empresa (tenant) se identifica por su CUIT. Los datos de
        todas se traducen a un único modelo canónico. Acá ves su salud, das de
        alta nuevas y seguís el registro de sincronización.
      </p>

      {error && (
        <div className="rounded-[10px] border border-destructive/35 bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {/* Panel de salud */}
      <div className="space-y-2">
        <h3 className="text-[15px] font-bold text-foreground">Panel de salud</h3>
        <section className="overflow-x-auto rounded-[12px] border bg-card">
          <div className="grid min-w-[720px] grid-cols-[1.8fr_1fr_0.7fr_0.7fr_0.7fr_1fr_0.7fr] items-center border-b border-border2 bg-card2 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            <span>Empresa</span>
            <span>Vía</span>
            <span className="text-right">Clientes</span>
            <span className="text-right">Oport.</span>
            <span className="text-right">Presup.</span>
            <span>Últ. sync</span>
            <span className="text-right">Estado</span>
          </div>
          {health.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No hay empresas todavía.
            </div>
          ) : (
            health.map((t) => {
              const st = STATUS_META[t.status] ?? { label: t.status, variant: "gray" as TintVariant };
              return (
                <div
                  key={t.id}
                  className="grid min-w-[720px] grid-cols-[1.8fr_1fr_0.7fr_0.7fr_0.7fr_1fr_0.7fr] items-center border-b border-border2 px-4 py-3 text-[13px] last:border-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground">{t.name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground tabular-nums">
                      CUIT {t.cuit}
                      {t.errors24h > 0 && (
                        <span className="ml-2 font-bold text-destructive">
                          {t.errors24h} error(es) 24h
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-[12px] text-text2">{VIA_LABEL[t.via] ?? t.via}</span>
                  <span className="text-right tabular-nums">{t.clients}</span>
                  <span className="text-right tabular-nums">{t.opportunities}</span>
                  <span className="text-right tabular-nums">{t.quotes}</span>
                  <span className="text-[12px] text-muted-foreground tabular-nums">
                    {t.lastSync ?? "—"}
                  </span>
                  <span className="flex justify-end">
                    <TintBadge variant={st.variant}>{st.label}</TintBadge>
                  </span>
                </div>
              );
            })
          )}
        </section>
      </div>

      {/* Alta de empresa (Vía A / onboarding) */}
      <div className="space-y-2">
        <h3 className="text-[15px] font-bold text-foreground">Dar de alta una empresa</h3>
        <p className="text-[12.5px] text-muted-foreground">
          Crea el espacio de la empresa en la central. El CUIT es la clave: no
          puede repetirse. Queda en estado “Onboarding”.
        </p>
        <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-dashed border-avbd bg-card2 p-3">
          <label className="flex flex-1 flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Razón social
            <input className={`${INPUT} min-w-[180px]`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            CUIT
            <input
              className={`${INPUT} w-40`}
              placeholder="30-71234567-1"
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Vía
            <select className={INPUT} value={via} onChange={(e) => setVia(e.target.value)}>
              <option value="A">A · CRM directo</option>
              <option value="B">B · sistema propio</option>
              <option value="C">C · otro CRM</option>
            </select>
          </label>
          <Button size="sm" disabled={isPending || !name.trim() || !cuit.trim()} onClick={create}>
            {isPending ? "Creando…" : "Crear empresa"}
          </Button>
        </div>
      </div>

      {/* Registro de sincronización */}
      <div className="space-y-2">
        <h3 className="text-[15px] font-bold text-foreground">Registro de sincronización</h3>
        <section className="overflow-x-auto rounded-[12px] border bg-card">
          <div className="grid min-w-[640px] grid-cols-[1fr_1.4fr_1fr_0.9fr_1.6fr] items-center border-b border-border2 bg-card2 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            <span>Fecha</span>
            <span>Empresa</span>
            <span>Entidad</span>
            <span>Resultado</span>
            <span>Detalle</span>
          </div>
          {syncLog.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Sin eventos de sincronización todavía.
            </div>
          ) : (
            syncLog.map((r) => (
              <div
                key={r.id}
                className="grid min-w-[640px] grid-cols-[1fr_1.4fr_1fr_0.9fr_1.6fr] items-center border-b border-border2 px-4 py-2.5 text-[12.5px] last:border-0"
              >
                <span className="text-muted-foreground tabular-nums">{r.fecha}</span>
                <span className="truncate pr-2 text-text2">{r.tenant}</span>
                <span className="truncate pr-2">
                  {r.entity} <span className="text-muted2">· {r.direction}</span>
                </span>
                <span>
                  <TintBadge variant={RESULT_VARIANT[r.result] ?? "gray"}>{r.result}</TintBadge>
                </span>
                <span className="truncate text-muted-foreground" title={r.detail ?? ""}>
                  {r.detail ?? "—"}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  createTaxRate,
  updateTaxRate,
  setDefaultTaxRate,
  deleteTaxRate,
  saveExchangeRate,
  deleteExchangeRate,
} from "@/app/(app)/admin/actions";

export type TaxRateRow = { id: string; name: string; rate: string; isDefault: boolean };
export type ExchangeRateRow = { id: string; date: string; usdToArs: string };

const INPUT =
  "rounded-[8px] border border-border bg-field px-2.5 py-1.5 text-[13px] outline-none focus:border-muted-foreground";

export function AdminBillingSection({
  taxRates,
  exchangeRates,
  today,
}: {
  taxRates: TaxRateRow[];
  exchangeRates: ExchangeRateRow[];
  today: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Alta IVA
  const [ivaName, setIvaName] = useState("");
  const [ivaRate, setIvaRate] = useState("");
  // Alta tipo de cambio
  const [fxDate, setFxDate] = useState(today);
  const [fxRate, setFxRate] = useState("");

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="max-w-[720px] space-y-8">
      {error && (
        <div className="rounded-[10px] border border-destructive/35 bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {/* IVA */}
      <div className="space-y-3">
        <div>
          <h3 className="text-[15px] font-bold text-foreground">Alícuotas de IVA</h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Las que se ofrecen al armar un presupuesto. La predeterminada se
            aplica por defecto a los ítems nuevos.
          </p>
        </div>

        <div className="space-y-2">
          {taxRates.map((t) => (
            <TaxRateEditor key={t.id} row={t} disabled={isPending} onRun={run} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-avbd bg-card2 p-3">
          <input
            className={`${INPUT} flex-1 min-w-[140px]`}
            placeholder="Nombre (p. ej. IVA 21%)"
            value={ivaName}
            onChange={(e) => setIvaName(e.target.value)}
          />
          <div className="flex items-center gap-1">
            <input
              className={`${INPUT} w-20`}
              placeholder="21"
              inputMode="decimal"
              value={ivaRate}
              onChange={(e) => setIvaRate(e.target.value)}
            />
            <span className="text-[13px] text-muted-foreground">%</span>
          </div>
          <Button
            size="sm"
            disabled={isPending || !ivaName.trim() || !ivaRate}
            onClick={() =>
              run(async () => {
                await createTaxRate(ivaName, ivaRate);
                setIvaName("");
                setIvaRate("");
              })
            }
          >
            + Agregar
          </Button>
        </div>
      </div>

      {/* Tipo de cambio */}
      <div className="space-y-3">
        <div>
          <h3 className="text-[15px] font-bold text-foreground">Tipo de cambio (ARS por USD)</h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Cargá la cotización por fecha. Sirve para consolidar métricas en una
            sola moneda — nunca mezcla los saldos, que van separados por moneda.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-dashed border-avbd bg-card2 p-3">
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Fecha
            <input
              type="date"
              className={INPUT}
              value={fxDate}
              onChange={(e) => setFxDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            1 USD = ARS
            <input
              className={`${INPUT} w-32`}
              placeholder="1050.00"
              inputMode="decimal"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            disabled={isPending || !fxDate || !fxRate}
            onClick={() =>
              run(async () => {
                await saveExchangeRate(fxDate, fxRate);
                setFxRate("");
              })
            }
          >
            Guardar cotización
          </Button>
        </div>

        {exchangeRates.length > 0 && (
          <section className="overflow-hidden rounded-[10px] border bg-card">
            {exchangeRates.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-b border-border2 px-4 py-2.5 text-[13px] last:border-0"
              >
                <span className="tabular-nums text-text2">{r.date}</span>
                <span className="tabular-nums font-semibold">
                  1 USD = $ {Number(r.usdToArs).toLocaleString("es-AR")}
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => deleteExchangeRate(r.id))}
                  className="text-[12px] font-medium text-destructive hover:underline disabled:opacity-40"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function TaxRateEditor({
  row,
  disabled,
  onRun,
}: {
  row: TaxRateRow;
  disabled: boolean;
  onRun: (fn: () => Promise<void>) => void;
}) {
  const [name, setName] = useState(row.name);
  const [rate, setRate] = useState(String(Number(row.rate)));
  const dirty = name !== row.name || rate !== String(Number(row.rate));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border bg-card px-3.5 py-2.5">
      <input
        className={`${INPUT} flex-1 min-w-[130px]`}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex items-center gap-1">
        <input
          className={`${INPUT} w-20`}
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
        <span className="text-[13px] text-muted-foreground">%</span>
      </div>

      {row.isDefault ? (
        <span className="rounded-[6px] bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
          Predeterminada
        </span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRun(() => setDefaultTaxRate(row.id))}
          className="text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Hacer predet.
        </button>
      )}

      {dirty && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onRun(() => updateTaxRate(row.id, name, rate))}
        >
          Guardar
        </Button>
      )}

      {!row.isDefault && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRun(() => deleteTaxRate(row.id))}
          className="text-[12px] font-medium text-destructive hover:underline disabled:opacity-40"
        >
          Eliminar
        </button>
      )}
    </div>
  );
}

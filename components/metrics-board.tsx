"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";

import { formatMoney } from "@/lib/opportunities";
import { stageHex } from "@/lib/stage-colors";
import { Currency } from "@/lib/generated/prisma/enums";

const APPROVED = "#E0503A";
const QUOTED = "#5B82D6";
const MODE_KEY = "metrics-chart-mode";
const ORDER_KEY = "metrics-card-order";

type Month = { label: string; quoted: string; approved: string };
export type MetricsSeries = { currency: string; maxValue: string; months: Month[] };
export type MetricsSegment = { currency: string; rows: { label: string; total: string }[] };
export type MetricsFunnel = {
  stage: string;
  color: string;
  count: number;
  m2: string;
  amounts: { total: string; currency: string }[];
};

type Props = {
  monthly: MetricsSeries[];
  bySegment: MetricsSegment[];
  funnel: MetricsFunnel[];
};

function toCurrency(code: string): Currency {
  return code === "USD" ? Currency.USD : Currency.ARS;
}
function compact(value: string, currency: string): string {
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value))}`;
}

function Handle() {
  return (
    <span
      className="cursor-grab select-none text-[15px] leading-none text-muted2 active:cursor-grabbing"
      title="Arrastrá para reordenar"
    >
      ⠿
    </span>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
      {children}
    </h2>
  );
}
function Legend() {
  return (
    <div className="flex gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: QUOTED }} /> Cotizado
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: APPROVED }} /> Aprobado
      </span>
    </div>
  );
}

/** Serie mensual en BARRAS agrupadas. */
function MonthlyBars({ series }: { series: MetricsSeries }) {
  const max = Number(series.maxValue) || 1;
  return (
    <div className="flex h-44 items-end gap-3 border-b border-border pb-px">
      {series.months.map((m) => (
        <div key={m.label} className="flex h-full flex-1 items-end justify-center gap-[2px]">
          <div
            className="w-5 rounded-t-[4px]"
            style={{ background: QUOTED, height: `${(Number(m.quoted) / max) * 100}%`, minHeight: Number(m.quoted) > 0 ? 3 : 0 }}
          />
          <div
            className="w-5 rounded-t-[4px]"
            style={{ background: APPROVED, height: `${(Number(m.approved) / max) * 100}%`, minHeight: Number(m.approved) > 0 ? 3 : 0 }}
          />
        </div>
      ))}
    </div>
  );
}

/** Serie mensual en LÍNEAS ascendentes (área + trazo), 2 series. */
function MonthlyLines({ series }: { series: MetricsSeries }) {
  const max = Number(series.maxValue) || 1;
  const n = series.months.length;
  const xy = (i: number, v: string) => ({
    x: n <= 1 ? 50 : (i / (n - 1)) * 100,
    y: 100 - (Number(v) / max) * 100,
  });
  const line = (key: "quoted" | "approved") =>
    series.months.map((m, i) => { const p = xy(i, m[key]); return `${p.x},${p.y}`; }).join(" ");
  const area = (key: "quoted" | "approved") => {
    const pts = series.months.map((m, i) => xy(i, m[key]));
    return `M0,100 ${pts.map((p) => `L${p.x},${p.y}`).join(" ")} L100,100 Z`;
  };
  return (
    <div className="relative h-44 border-b border-border">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--border2)" strokeWidth="0.4" />
        ))}
        <path d={area("approved")} fill={APPROVED} opacity={0.1} />
        <polyline
          points={line("quoted")}
          fill="none"
          stroke={QUOTED}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={line("approved")}
          fill="none"
          stroke={APPROVED}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function MonthlyCard({ series, mode }: { series: MetricsSeries; mode: "lineas" | "barras" }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Presupuestos por mes · {series.currency}</SectionTitle>
        <Legend />
      </div>
      {mode === "barras" ? <MonthlyBars series={series} /> : <MonthlyLines series={series} />}
      <div className="mt-1.5 flex gap-3">
        {series.months.map((m) => (
          <div key={m.label} className="flex-1 text-center text-[11.5px] text-muted2">
            {m.label}
          </div>
        ))}
      </div>
    </>
  );
}

function SegmentCard({ seg }: { seg: MetricsSegment }) {
  const max = Number(seg.rows[0]?.total) || 1;
  const cur = toCurrency(seg.currency);
  return (
    <>
      <div className="mb-4">
        <SectionTitle>Aprobado por segmento · {seg.currency}</SectionTitle>
      </div>
      <div className="space-y-3">
        {seg.rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-text2">{row.label}</span>
              <span className="tabular-nums text-muted-foreground" title={formatMoney(row.total, cur) ?? ""}>
                {compact(row.total, seg.currency)}
              </span>
            </div>
            <div className="h-2 rounded-[4px] bg-chip">
              <div
                className="h-2 rounded-[4px]"
                style={{ background: APPROVED, width: `${Math.max((Number(row.total) / max) * 100, 2)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function FunnelCard({ funnel }: { funnel: MetricsFunnel[] }) {
  const maxCount = Math.max(...funnel.map((f) => f.count), 1);
  return (
    <>
      <div className="mb-4">
        <SectionTitle>Embudo del pipeline</SectionTitle>
      </div>
      <div className="space-y-3">
        {funnel.map((row) => {
          const hex = stageHex(row.color);
          return (
            <div key={row.stage}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                <span className="flex items-center gap-2 text-text2">
                  <span className="h-[6px] w-[6px] rounded-[2px]" style={{ background: hex }} />
                  {row.stage} <span className="text-muted-foreground">· {row.count}</span>
                </span>
                <span className="text-xs tabular-nums text-muted2">
                  {row.amounts.map((a) => compact(a.total, a.currency)).join(" · ")}
                  {Number(row.m2) > 0 && ` · ${Number(row.m2).toLocaleString("es-AR")} m²`}
                </span>
              </div>
              <div className="h-2 rounded-[4px] bg-chip">
                <div
                  className="h-2 rounded-[4px]"
                  style={{ background: hex, width: `${Math.max((row.count / maxCount) * 100, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function MetricsBoard({ monthly, bySegment, funnel }: Props) {
  const [mode, setMode] = useState<"lineas" | "barras">("barras");
  const [order, setOrder] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  // Descriptor de cada tarjeta reordenable.
  const cards = useMemo(() => {
    const list: { id: string; render: () => React.ReactNode }[] = [];
    for (const s of monthly)
      list.push({ id: `monthly-${s.currency}`, render: () => <MonthlyCard series={s} mode={mode} /> });
    for (const b of bySegment)
      list.push({ id: `segment-${b.currency}`, render: () => <SegmentCard seg={b} /> });
    if (funnel.length) list.push({ id: "funnel", render: () => <FunnelCard funnel={funnel} /> });
    return list;
  }, [monthly, bySegment, funnel, mode]);

  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === "lineas" || m === "barras") setMode(m);
      const o = localStorage.getItem(ORDER_KEY);
      if (o) setOrder(JSON.parse(o));
    } catch {
      /* localStorage no disponible */
    }
    setReady(true);
  }, []);

  const orderedIds = useMemo(() => {
    const ids = cards.map((c) => c.id);
    if (!order.length) return ids;
    const kept = order.filter((id) => ids.includes(id));
    const rest = ids.filter((id) => !kept.includes(id));
    return [...kept, ...rest];
  }, [cards, order]);

  function persistMode(m: "lineas" | "barras") {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  }
  function onDragEnd(r: DropResult) {
    if (!r.destination) return;
    const next = [...orderedIds];
    const [moved] = next.splice(r.source.index, 1);
    next.splice(r.destination.index, 0, moved);
    setOrder(next);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {}
  }

  const byId = new Map(cards.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      {/* Control segmentado Líneas / Barras (iOS) */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-[10px] bg-chip p-0.5 text-[13px]">
          {(["barras", "lineas"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => persistMode(m)}
              className="rounded-[8px] px-3.5 py-1.5 font-semibold transition-colors"
              style={
                mode === m
                  ? { background: "var(--card)", color: "var(--text1)", boxShadow: "var(--shadow-sm)" }
                  : { color: "var(--muted)" }
              }
            >
              {m === "barras" ? "Barras" : "Líneas"}
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-muted2">Arrastrá ⠿ para reordenar</span>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="metrics">
          {(dp) => (
            <div ref={dp.innerRef} {...dp.droppableProps} className="space-y-[14px]">
              {orderedIds.map((id, i) => {
                const card = byId.get(id);
                if (!card) return null;
                return (
                  <Draggable key={id} draggableId={id} index={i} isDragDisabled={!ready}>
                    {(dr, snap) => (
                      <section
                        ref={dr.innerRef}
                        {...dr.draggableProps}
                        className="rounded-[16px] border bg-card p-5"
                        style={{
                          boxShadow: snap.isDragging ? "var(--shadow)" : "var(--shadow-sm)",
                          ...dr.draggableProps.style,
                        }}
                      >
                        <div className="mb-2 flex items-center justify-end" {...dr.dragHandleProps}>
                          <Handle />
                        </div>
                        {card.render()}
                      </section>
                    )}
                  </Draggable>
                );
              })}
              {dp.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}

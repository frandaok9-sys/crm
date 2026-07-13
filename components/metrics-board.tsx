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
const SIZE_KEY = "metrics-card-sizes";

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

type Pt = { x: number; y: number };
/** Path suave (Catmull-Rom → Bézier) para curvas realistas. */
function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

/** Serie mensual en LÍNEAS suaves con área degradé y puntos (2 series). */
function MonthlyLines({ series }: { series: MetricsSeries }) {
  const max = Number(series.maxValue) || 1;
  const n = series.months.length;
  const gid = `mg-${series.currency}`;
  const pts = (key: "quoted" | "approved"): Pt[] =>
    series.months.map((m, i) => ({
      x: n <= 1 ? 50 : (i / (n - 1)) * 100,
      y: 100 - (Number(m[key]) / max) * 92 - 4, // margen sup/inf para respirar
    }));
  const qPts = pts("quoted");
  const aPts = pts("approved");
  const areaPath = `${smoothPath(aPts)} L 100,100 L 0,100 Z`;
  const dot = (p: Pt, color: string, big = false) => (
    <span
      className="absolute rounded-full"
      style={{
        left: `${p.x}%`,
        top: `${p.y}%`,
        width: big ? 11 : 6,
        height: big ? 11 : 6,
        transform: "translate(-50%,-50%)",
        background: big ? color : "var(--card)",
        border: `${big ? 3 : 1.5}px solid ${color}`,
        boxShadow: big ? "var(--shadow-sm)" : "none",
      }}
    />
  );
  return (
    <div className="relative h-44 border-b border-border">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={APPROVED} stopOpacity={0.3} />
            <stop offset="100%" stopColor={APPROVED} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--border2)" strokeWidth="0.5" />
        ))}
        <path d={areaPath} fill={`url(#${gid})`} />
        <path
          d={smoothPath(qPts)}
          fill="none"
          stroke={QUOTED}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="4 3"
          opacity={0.85}
        />
        <path
          d={smoothPath(aPts)}
          fill="none"
          stroke={APPROVED}
          strokeWidth="2.75"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      {/* Puntos (HTML, redondos aunque el SVG esté estirado) */}
      {qPts.map((p, i) => (
        <span key={`q${i}`}>{dot(p, QUOTED)}</span>
      ))}
      {aPts.map((p, i) => (
        <span key={`a${i}`}>{dot(p, APPROVED, i === aPts.length - 1)}</span>
      ))}
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
  const [sizes, setSizes] = useState<Record<string, "full" | "half">>({});
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
      const sz = localStorage.getItem(SIZE_KEY);
      if (sz) setSizes(JSON.parse(sz));
    } catch {
      /* localStorage no disponible */
    }
    setReady(true);
  }, []);

  function toggleSize(id: string) {
    setSizes((prev) => {
      const value: "full" | "half" = prev[id] === "half" ? "full" : "half";
      const next: Record<string, "full" | "half"> = { ...prev, [id]: value };
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

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
        <Droppable droppableId="metrics" direction="horizontal">
          {(dp) => (
            <div ref={dp.innerRef} {...dp.droppableProps} className="flex flex-wrap gap-[14px]">
              {orderedIds.map((id, i) => {
                const card = byId.get(id);
                if (!card) return null;
                const half = (sizes[id] ?? "full") === "half";
                return (
                  <Draggable key={id} draggableId={id} index={i} isDragDisabled={!ready}>
                    {(dr, snap) => (
                      <section
                        ref={dr.innerRef}
                        {...dr.draggableProps}
                        className="rounded-[16px] border bg-card p-5"
                        style={{
                          width: half ? "calc(50% - 7px)" : "100%",
                          boxShadow: snap.isDragging ? "var(--shadow)" : "var(--shadow-sm)",
                          ...dr.draggableProps.style,
                        }}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => toggleSize(id)}
                            className="flex items-center gap-1.5 rounded-[7px] border border-border2 px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-text1"
                            title={half ? "Ancho completo" : "Cuadrado (2 por fila)"}
                          >
                            {half ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="3" width="10" height="6" rx="1" /></svg>
                                Completo
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="2" width="4.5" height="8" rx="1" /><rect x="6.5" y="2" width="4.5" height="8" rx="1" /></svg>
                                Cuadrado
                              </>
                            )}
                          </button>
                          <span className="cursor-grab active:cursor-grabbing" {...dr.dragHandleProps}>
                            <Handle />
                          </span>
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

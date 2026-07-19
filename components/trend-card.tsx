import { hexA } from "@/lib/design";

const UP = "#34C759";
const DOWN = "#FF3B30";

function buildArea(series: number[], w = 220, h = 50, top = 8, bot = 8) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const pts = series.map((v, i) => {
    const x = series.length <= 1 ? w / 2 : (i / (series.length - 1)) * w;
    const y = top + (1 - (v - min) / range) * (h - top - bot);
    return [x, y] as const;
  });
  const points = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area =
    `M0,${h} ` +
    pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") +
    ` L${w},${h} Z`;
  return { points, area };
}

/**
 * Trend card de Métricas (handoff v5): label UPPERCASE + valor + pill ▲/▼ +
 * nota, con un mini gráfico de área (verde si sube, rojo si baja) cuando hay
 * serie mensual. Sin serie, muestra sólo el valor y la nota.
 */
export function TrendCard({
  label,
  value,
  note,
  series,
  trendText,
}: {
  label: string;
  value: string;
  note?: string;
  series?: number[];
  trendText?: string;
}) {
  const hasArea = series != null && series.length >= 2;
  const up = hasArea ? series[series.length - 1] >= series[0] : true;
  const color = up ? UP : DOWN;
  const gid = `trend-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const chart = hasArea ? buildArea(series) : null;

  return (
    <div
      className="flex flex-col gap-2 rounded-[16px] border bg-card p-5"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-[23px] font-bold leading-none tabular-nums">{value}</span>
        {trendText && (
          <span
            className="rounded-[7px] px-[7px] py-0.5 text-[11.5px] font-semibold"
            style={{ color, background: hexA(color, 0.14) }}
          >
            {trendText}
          </span>
        )}
      </div>
      {note && <span className="text-[11.5px] text-muted2">{note}</span>}
      {chart && (
        <svg
          viewBox="0 0 220 50"
          preserveAspectRatio="none"
          className="mt-1 h-[42px] w-full overflow-visible"
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={chart.area} fill={`url(#${gid})`} />
          <polyline
            points={chart.points}
            fill="none"
            stroke={color}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}

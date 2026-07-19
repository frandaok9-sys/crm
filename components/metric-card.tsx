import { hexA, sparkPoints } from "@/lib/design";

export type MetricTrend = {
  /** Texto corto, ej. "▲ 3" o "▼ 1". */
  text: string;
  dir: "up" | "down" | "flat";
};

/**
 * Tarjeta de métrica del Inicio (handoff v5): franja de seguridad roja arriba,
 * chip de ícono técnico, valor grande, pill de tendencia y sparkline a la
 * derecha. Componente puro (server-renderable).
 */
export function MetricCard({
  label,
  value,
  iconPath,
  series,
  sparkColor,
  trend,
  note,
}: {
  label: string;
  value: string;
  iconPath: string;
  series: number[];
  sparkColor: string;
  trend?: MetricTrend;
  note?: string;
}) {
  const trendColor =
    trend?.dir === "up"
      ? "#2E7D54"
      : trend?.dir === "down"
        ? "#B8402E"
        : "var(--muted)";
  const trendBg =
    trend?.dir === "up"
      ? hexA("#4FA97A", 0.14)
      : trend?.dir === "down"
        ? hexA("#C8523F", 0.14)
        : "var(--chip)";

  return (
    <div
      className="flex flex-col gap-3 rounded-[18px] border bg-card px-5 pb-[18px] pt-4"
      style={{ borderTop: "3px solid var(--primary)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-chip">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text1)"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={iconPath} />
          </svg>
        </span>
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[25px] font-bold leading-none tracking-[-0.03em] tabular-nums">
            {value}
          </span>
          <div className="flex items-center gap-1.5">
            {trend && (
              <span
                className="rounded-[7px] px-[7px] py-0.5 text-[11.5px] font-semibold"
                style={{ color: trendColor, background: trendBg }}
              >
                {trend.text}
              </span>
            )}
            {note && <span className="text-[11.5px] text-muted2">{note}</span>}
          </div>
        </div>
        <svg
          width="60"
          height="34"
          viewBox="0 0 72 36"
          preserveAspectRatio="none"
          className="shrink-0 overflow-visible"
        >
          <polyline
            points={sparkPoints(series)}
            fill="none"
            stroke={sparkColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

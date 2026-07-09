import { cn } from "@/lib/utils";

/**
 * KPI card del handoff: card --card, borde --border, borde izquierdo 3px
 * acento, radius 12px. Label 11px uppercase → número Oswald → nota 12px.
 */
export function KpiCard({
  label,
  value,
  note,
  noteClassName,
  size = "lg",
}: {
  label: string;
  value: string;
  note?: string;
  noteClassName?: string;
  size?: "lg" | "md";
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] border border-l-[3px] border-l-primary bg-card",
        size === "lg" ? "px-5 py-[18px]" : "px-[18px] py-4"
      )}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-heading font-semibold tabular-nums",
          size === "lg" ? "text-[30px] leading-9" : "text-[22px] leading-7"
        )}
      >
        {value}
      </div>
      {note && (
        <div className={cn("mt-1 text-xs text-muted-foreground", noteClassName)}>
          {note}
        </div>
      )}
    </div>
  );
}

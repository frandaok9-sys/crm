import { cn } from "@/lib/utils";

/**
 * Badge semántico del handoff: fondo = color al 14% alpha, texto = variante
 * clara (modo oscuro) / oscura (modo claro). Radius 6px.
 */
export type TintVariant = "green" | "blue" | "amber" | "red" | "gray";

const VARIANTS: Record<TintVariant, string> = {
  green: "bg-[#4FA97A]/[0.14] text-[#2E7D54] dark:text-[#7CC8A2]",
  blue: "bg-[#5B82D6]/[0.14] text-[#3D62B8] dark:text-[#8FAEE8]",
  amber: "bg-[#D9A03C]/[0.14] text-[#A5721E] dark:text-[#E0B45E]",
  red: "bg-[#C8523F]/[0.14] text-[#B8402E] dark:text-[#EE9585]",
  gray: "bg-chip text-muted-foreground",
};

export function TintBadge({
  variant,
  children,
  className,
}: {
  variant: TintVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-[6px] px-2 py-[3px] text-[11px] font-semibold",
        VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

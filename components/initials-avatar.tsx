import { cn } from "@/lib/utils";

/** Colores asignables a vendedores (tarjetas del pipeline). */
const SELLER_COLORS = [
  "#5B82D6",
  "#9B7BE8",
  "#4FA97A",
  "#D9A03C",
  "#E0503A",
  "#8A8D95",
];

export function sellerColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return SELLER_COLORS[Math.abs(hash) % SELLER_COLORS.length];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Avatar circular con iniciales. Sin `tint`: fondo --avbg / borde --avbd.
 * Con `tint` (hex): fondo al 18% alpha y texto del color.
 */
export function InitialsAvatar({
  name,
  size = 24,
  tint,
  className,
}: {
  name: string;
  size?: number;
  tint?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        !tint && "border border-avbd bg-avbg text-text2",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.38)),
        ...(tint ? { background: `${tint}2E`, color: tint } : {}),
      }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}

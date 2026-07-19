/**
 * Helpers de color y de gráficos del handoff v5 "iOS + Industrial + Glass/Malla".
 * Puros (sin estado ni DOM) para usarlos tanto en server como en client components.
 */

/** Colores del sistema iOS (ambos temas). */
export const IOS = {
  blue: "#007AFF",
  green: "#34C759",
  orange: "#FF9500",
  red: "#FF3B30",
  purple: "#AF52DE",
  teal: "#5AC8FA",
  pink: "#FF2D55",
  indigo: "#5856D6",
  gray: "#8E8E93",
} as const;

/** #RRGGBB + alpha → rgba(). */
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Aclara un color sumando `amt` (0–255) a cada canal. */
export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return `rgb(${r}, ${g}, ${b})`;
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

/** Mezcla `hex` con `target` en proporción `amt` (0–1). */
function mix(hex: string, target: string, amt: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(target.slice(1), 16);
  const r = ((a >> 16) & 255) * (1 - amt) + ((b >> 16) & 255) * amt;
  const g = ((a >> 8) & 255) * (1 - amt) + ((b >> 8) & 255) * amt;
  const bl = (a & 255) * (1 - amt) + (b & 255) * amt;
  return "#" + toHex(r) + toHex(g) + toHex(bl);
}

/** Suaviza un color ~26% hacia gris neutro (donut/anillos/etapas). */
export function soft(hex: string): string {
  return mix(hex, "#9AA0A8", 0.26);
}

/** Tinte de badge/chip: color al 14% de opacidad. */
export function tint(hex: string): string {
  return hexA(hex, 0.14);
}

/**
 * Puntos de una sparkline (`points` de un <polyline>) en un viewBox de w×h.
 * Escala los valores al alto disponible; con `preserveAspectRatio="none"`
 * el SVG estira el ancho sin deformar el trazo.
 */
export function sparkPoints(vals: number[], w = 72, h = 30, pad = 3): string {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  return vals
    .map((v, i) => {
      const x =
        pad + (vals.length <= 1 ? 0 : (i / (vals.length - 1)) * (w - pad * 2));
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Agrupa fechas en las últimas `n` cubetas mensuales (más vieja → más nueva). */
export function monthlyBuckets(
  dates: Date[],
  n = 6,
  now = new Date()
): { label: string; count: number }[] {
  const buckets: { label: string; count: number; key: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("es-AR", { month: "short" }),
      count: 0,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const date of dates) {
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const i = index.get(key);
    if (i != null) buckets[i].count++;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

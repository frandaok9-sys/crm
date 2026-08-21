import Link from "next/link";

import { ICON_PATHS, type NavItem } from "@/lib/nav-registry";
import { cn } from "@/lib/utils";

/**
 * Cuadrado de app (escritorio de aplicaciones y lanzador). Sin estado: se
 * usa igual desde el servidor y desde componentes del navegador.
 */
export function AppTile({
  item,
  compact = false,
  onNavigate,
}: {
  item: NavItem;
  /** Versión chica (lanzador superpuesto / celular). */
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex flex-col items-start justify-end rounded-[18px] border border-border bg-card text-left shadow-[var(--shadow-sm)] backdrop-blur-md transition-all duration-150 hover:-translate-y-[3px] hover:border-primary/40 hover:shadow-[var(--shadow-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        compact ? "aspect-square p-3" : "aspect-square p-4",
        !compact && item.sub && item.sub.length > 0 && "sm:col-span-2 sm:aspect-auto sm:min-h-[150px]"
      )}
    >
      <span
        className={cn(
          "mb-auto flex items-center justify-center rounded-[15px] text-white",
          compact ? "h-11 w-11 rounded-[12px]" : "h-[54px] w-[54px]"
        )}
        style={{
          background: item.color,
          boxShadow: "inset 0 -2px 0 rgba(0,0,0,.08), 0 6px 14px rgba(0,0,0,.12)",
        }}
      >
        <svg
          width={compact ? 22 : 26}
          height={compact ? 22 : 26}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={ICON_PATHS[item.href] ?? ICON_PATHS["/dashboard"]} />
        </svg>
      </span>
      {item.badge != null && item.badge > 0 && (
        <span className="absolute right-3 top-3 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold tabular-nums text-white">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
      <span className={cn("mt-3 font-bold text-foreground", compact ? "text-[12.5px]" : "text-[14px]")}>
        {item.label}
      </span>
      {!compact && (
        <span className="mt-0.5 text-[11.5px] text-muted-foreground">{item.hint}</span>
      )}
      {!compact && item.sub && item.sub.length > 0 && (
        <span className="mt-2 hidden flex-wrap gap-1.5 sm:flex">
          {item.sub.map((s) => (
            <span key={s} className="rounded-full bg-chip px-2 py-0.5 text-[11px] text-text2">
              {s}
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ICON_PATHS, type NavItem } from "@/lib/nav-registry";

export const RECENT_KEY = "rc-apps-recientes";

/** Lee las apps recientes guardadas en este navegador (rutas). */
export function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Anota una app como recién usada (máximo 5). */
export function pushRecent(href: string) {
  try {
    const list = [href, ...readRecents().filter((x) => x !== href)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* sin almacenamiento local */
  }
}

/**
 * "Recientes" del escritorio de apps: lo último que usó esta persona en este
 * navegador. Se renderiza solo en el cliente (la lista vive en localStorage).
 */
export function RecentApps({ items }: { items: NavItem[] }) {
  const [recent, setRecent] = useState<NavItem[]>([]);
  useEffect(() => {
    const byHref = new Map(items.map((i) => [i.href, i]));
    setRecent(readRecents().map((h) => byHref.get(h)).filter((x): x is NavItem => !!x));
  }, [items]);
  if (recent.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Recientes
        <span className="font-medium normal-case tracking-normal">· lo último que usaste</span>
      </h2>
      <div className="flex flex-wrap gap-2.5">
        {recent.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-border bg-card pl-1.5 pr-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-hoverbg"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-white"
              style={{ background: item.color }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={ICON_PATHS[item.href] ?? ICON_PATHS["/dashboard"]} />
              </svg>
            </span>
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

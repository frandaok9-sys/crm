"use client";

import { useEffect, useRef, useState } from "react";

import {
  searchClientOptionsAction,
  type ClientOption,
} from "@/app/(app)/clientes/search-action";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

/**
 * Searchable client selector. Busca en el servidor a medida que se tipea
 * (debounce), así nunca se manda la cartera completa al navegador — clave con
 * 2000+ clientes. The picked client's id is submitted via a hidden input
 * named `name`.
 */
export function ClientCombobox({
  name,
  defaultId = "",
  defaultLabel = "",
}: {
  name: string;
  defaultId?: string;
  defaultLabel?: string;
}) {
  const [query, setQuery] = useState(defaultLabel);
  const [selectedId, setSelectedId] = useState(defaultId);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  // Búsqueda con debounce; descarta respuestas viejas que lleguen tarde.
  useEffect(() => {
    if (!open) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchClientOptionsAction(query);
        if (requestSeq.current === seq) setOptions(rows);
      } catch {
        if (requestSeq.current === seq) setOptions([]);
      } finally {
        if (requestSeq.current === seq) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  function select(item: ClientOption) {
    setSelectedId(item.id);
    setQuery(item.legalName);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        required
        placeholder="Buscá una empresa…"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedId("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        className={inputClass}
      />
      <input type="hidden" name={name} value={selectedId} />

      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          {options.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(c);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                {c.legalName}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && query.trim() !== "" && options.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-500 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          Sin resultados
        </div>
      )}

      {open && loading && options.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-400 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          Buscando…
        </div>
      )}
    </div>
  );
}

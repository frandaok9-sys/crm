"use client";

import { useMemo, useRef, useState } from "react";

type Item = { id: string; legalName: string };

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Searchable client selector. Type to filter; the picked client's id is
 * submitted via a hidden input named `name`. Replaces a long <select>.
 */
export function ClientCombobox({
  clients,
  name,
}: {
  clients: Item[];
  name: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const list = q
      ? clients.filter((c) => normalize(c.legalName).includes(q))
      : clients;
    return list.slice(0, 50);
  }, [query, clients]);

  function select(item: Item) {
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

      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(c);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {c.legalName}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim() !== "" && filtered.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-zinc-500 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          Sin resultados
        </div>
      )}
    </div>
  );
}

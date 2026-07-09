"use client";

import { useState } from "react";

/**
 * Light/dark switch. Toggles the "dark" class on <html> instantly and
 * persists the choice in a cookie so the server renders the right theme
 * on the next visit (no flash).
 */
export function ThemeToggle({ initial }: { initial: "dark" | "light" }) {
  const [theme, setTheme] = useState<"dark" | "light">(initial);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label="Cambiar tema"
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 text-base transition-colors hover:border-zinc-500 hover:bg-zinc-800"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

"use client";

import { useState, type ReactNode } from "react";

type Tab = { id: string; label: string; content: ReactNode };

export function AdminTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[13.5px] transition-colors ${
              active === tab.id
                ? "border-primary font-bold text-foreground"
                : "border-transparent font-medium text-muted-foreground hover:text-text2"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div key={tab.id} className={active === tab.id ? "" : "hidden"}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}

"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export type SettingsTab = { id: string; label: string; content: React.ReactNode };

/** Réglages en onglets (ARIA tabs, flèches/Home/End, hash d'URL conservé). */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [active, setActive] = React.useState(tabs[0]!.id);
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  React.useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (tabs.some((t) => t.id === hash)) setActive(hash);
  }, [tabs]);

  const select = (id: string) => {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const id = tabs[next]!.id;
    select(id);
    refs.current[id]?.focus();
  };

  return (
    <div className="grid gap-6">
      <div role="tablist" aria-label="Sections des réglages" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
              active === t.id ? "border-accent text-text" : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="grid gap-6">
          {t.content}
        </div>
      ))}
    </div>
  );
}

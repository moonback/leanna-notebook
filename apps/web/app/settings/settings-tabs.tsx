"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export type SettingsTab = { id: string; label: string; description?: string; icon?: React.ReactNode; content: React.ReactNode };

/** Réglages en navigation latérale (ARIA tabs, flèches/Home/End, hash d'URL conservé). Horizontale sur mobile. */
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
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const id = tabs[next]!.id;
    select(id);
    refs.current[id]?.focus();
  };

  const current = tabs.find((t) => t.id === active) ?? tabs[0]!;

  return (
    <div className="mobile-settings-content grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
      <div
        role="tablist"
        aria-label="Sections des réglages"
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        className="mobile-settings-tabs flex gap-1 overflow-x-auto border-b pb-2 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:flex-col lg:overflow-visible lg:border-b-0 lg:pb-0"
      >
        {tabs.map((t) => {
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[t.id] = el; }}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(t.id)}
              className={cn(
                "group flex shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors lg:w-full",
                selected ? "bg-accent-soft font-medium text-on-accent-soft" : "text-text-muted hover:bg-surface hover:text-text",
              )}
            >
              {t.icon && (
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md border [&_svg]:size-4",
                    selected ? "border-transparent bg-surface-raised text-accent" : "bg-surface-raised text-text-muted group-hover:text-text",
                  )}
                >
                  {t.icon}
                </span>
              )}
              <span className="min-w-0 truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid min-w-0 gap-6">
        <div className="grid gap-1">
          <h2 className="text-xl">{current.label}</h2>
          {current.description && <p className="max-w-prose text-sm text-text-muted">{current.description}</p>}
        </div>
        {tabs.map((t) => (
          <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="grid gap-6">
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}

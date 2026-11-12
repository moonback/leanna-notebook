"use client";

import * as React from "react";
import { Copy, EyeOff, Globe, LoaderCircle, Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DesktopBrowserApi, DesktopBrowserState } from "./browser-api";

/** Favicon distante, chargée sans référent ; icône générique si elle est absente ou illisible. */
export function Favicon({ url }: { url: string | null }) {
  const [broken, setBroken] = React.useState(false);
  if (!url || broken) return <Globe className="size-3.5 shrink-0" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" referrerPolicy="no-referrer" className="size-3.5 shrink-0 rounded-sm" onError={() => setBroken(true)} />;
}

/** Barre d'onglets : sélection, fermeture, duplication, réordonnancement (glisser-déposer ou Alt+Maj+flèches). */
export function TabStrip({ api, state }: { api: DesktopBrowserApi; state: DesktopBrowserState }) {
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  function drop(targetId: string) {
    const index = state.tabs.findIndex((tab) => tab.id === targetId);
    if (dragId && dragId !== targetId && index >= 0) void api.moveTab(dragId, index);
    setDragId(null);
    setOverId(null);
  }

  return (
    <div role="tablist" aria-label="Onglets" className="flex h-10 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border bg-surface-sunken px-2">
      {state.tabs.map((tab, index) => {
        const active = tab.id === state.activeTabId;
        return (
          <div
            key={tab.id}
            draggable
            onDragStart={(event) => { setDragId(tab.id); event.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(event) => { event.preventDefault(); setOverId(tab.id); }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDrop={(event) => { event.preventDefault(); drop(tab.id); }}
            className={cn(
              "group flex h-8 min-w-28 max-w-56 flex-1 items-center gap-1 rounded-t-md border border-b-0 px-2 text-xs transition-colors",
              active ? "border-border bg-surface-raised text-text" : "border-transparent text-text-muted hover:bg-surface",
              overId === tab.id && dragId && dragId !== tab.id && "border-l-2 border-l-accent",
              dragId === tab.id && "opacity-50",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              data-tab-id={tab.id}
              title={`${tab.title}\n${tab.url}`}
              className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:underline"
              onClick={() => void api.activateTab(tab.id)}
              onAuxClick={(event) => { if (event.button === 1) void api.closeTab(tab.id); }}
              onKeyDown={(event) => {
                if (!event.altKey || !event.shiftKey) return;
                if (event.key === "ArrowLeft") void api.moveTab(tab.id, Math.max(0, index - 1));
                if (event.key === "ArrowRight") void api.moveTab(tab.id, index + 1);
              }}
            >
              {tab.loading ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-label="Chargement" />
                : tab.crashed || tab.error ? <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-label="Erreur" />
                : tab.isPrivate ? <EyeOff className="size-3.5 shrink-0" aria-label="Onglet privé" />
                : <Favicon key={tab.favicon} url={tab.favicon} />}
              <span className="truncate">{tab.title || "Nouvel onglet"}</span>
            </button>
            <button type="button" aria-label={`Dupliquer l’onglet ${tab.title}`} title="Dupliquer l’onglet"
              className="hidden rounded p-0.5 opacity-60 hover:bg-surface-sunken hover:opacity-100 group-hover:block group-focus-within:block"
              onClick={() => void api.duplicateTab(tab.id)}>
              <Copy className="size-3" aria-hidden />
            </button>
            <button type="button" aria-label={`Fermer l’onglet ${tab.title}`} title="Fermer l’onglet (Ctrl+W)"
              className="rounded p-0.5 opacity-60 hover:bg-surface-sunken hover:opacity-100"
              onClick={() => void api.closeTab(tab.id)}>
              <X className="size-3" aria-hidden />
            </button>
          </div>
        );
      })}
      <div className="flex shrink-0 items-center gap-0.5 self-center pl-1">
        <Button size="icon-sm" variant="ghost" aria-label="Nouvel onglet" title="Nouvel onglet (Ctrl+T)" onClick={() => void api.createTab()}>
          <Plus aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Nouvel onglet privé" title="Nouvel onglet privé : session séparée, non enregistrée dans l’historique. Ne rend pas anonyme."
          onClick={() => void api.createTab({ isPrivate: true })}>
          <EyeOff aria-hidden />
        </Button>
      </div>
    </div>
  );
}

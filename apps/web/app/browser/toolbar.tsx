"use client";

import * as React from "react";
import {
  ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, EyeOff, Library, Lock, Maximize, Minimize, Minus, Plus, RotateCw,
  Settings, ShieldAlert, Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DesktopBrowserApi, DesktopBrowserTab } from "./browser-api";

export type BrowserPanel = "ai" | "library" | "settings";

type Props = {
  api: DesktopBrowserApi;
  tab: DesktopBrowserTab | null;
  fullscreen: boolean;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  panel: BrowserPanel | null;
  onPanel: (panel: BrowserPanel) => void;
  addressRef: React.RefObject<HTMLInputElement | null>;
};

/** Navigation, barre d'adresse avec indicateur de sécurité, zoom, plein écran et bascule des panneaux. */
export function Toolbar({ api, tab, fullscreen, bookmarked, onToggleBookmark, panel, onPanel, addressRef }: Props) {
  const url = tab && tab.security !== "internal" ? tab.url : "";
  const [address, setAddress] = React.useState(url);
  const [editing, setEditing] = React.useState(false);

  // L'adresse suit la navigation, sauf pendant que l'utilisateur tape.
  React.useEffect(() => { if (!editing) setAddress(url); }, [url, editing, tab?.id]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!tab || !address.trim()) return;
    void api.navigate(tab.id, address).then((accepted) => {
      if (accepted) { setEditing(false); addressRef.current?.blur(); }
      else setAddress(url);
    });
  }

  const security = !tab ? null
    : tab.isPrivate ? { icon: EyeOff, label: "Navigation privée", tone: "text-text-muted" }
    : tab.security === "secure" ? { icon: Lock, label: "Connexion sécurisée (HTTPS)", tone: "text-success" }
    : tab.security === "insecure" ? { icon: ShieldAlert, label: "Connexion non sécurisée", tone: "text-warning" }
    : null;

  return (
    <form onSubmit={submit} className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface-raised px-2">
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Page précédente" title="Précédent (Alt+←)" disabled={!tab?.canGoBack}
        onClick={() => tab && void api.goBack(tab.id)}><ArrowLeft aria-hidden /></Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Page suivante" title="Suivant (Alt+→)" disabled={!tab?.canGoForward}
        onClick={() => tab && void api.goForward(tab.id)}><ArrowRight aria-hidden /></Button>
      <Button type="button" size="icon-sm" variant="ghost" disabled={!tab}
        aria-label={tab?.loading ? "Arrêter le chargement" : "Recharger la page"} title={tab?.loading ? "Arrêter" : "Recharger (Ctrl+R)"}
        onClick={() => tab && void (tab.loading ? api.stop(tab.id) : api.reload(tab.id))}>
        {tab?.loading ? <X aria-hidden /> : <RotateCw aria-hidden />}
      </Button>

      <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-pill border border-border-input bg-bg px-3 focus-within:border-focus">
        {security && (
          <span className={cn("flex shrink-0 items-center gap-1 text-xs", security.tone)} title={security.label} data-security={tab?.security}>
            <security.icon className="size-3.5" aria-hidden />
            <span className={tab?.security === "insecure" && !tab.isPrivate ? "hidden lg:inline" : "sr-only"}>{security.label}</span>
          </span>
        )}
        <input
          ref={addressRef}
          aria-label="Adresse web ou recherche"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-subtle"
          placeholder="Rechercher ou saisir une adresse"
          value={address}
          onChange={(event) => { setEditing(true); setAddress(event.target.value); }}
          onFocus={(event) => event.target.select()}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => { if (event.key === "Escape") { setEditing(false); setAddress(url); event.currentTarget.blur(); } }}
          spellCheck={false}
          autoComplete="off"
        />
        {tab && tab.blockedPopups > 0 && (
          <span className="shrink-0 text-xs text-text-muted" title="Fenêtres pop-up bloquées sur cette page">{tab.blockedPopups} pop-up bloquée{tab.blockedPopups > 1 ? "s" : ""}</span>
        )}
        <button type="button" disabled={!url} aria-pressed={bookmarked} onClick={onToggleBookmark}
          aria-label={bookmarked ? "Retirer des favoris" : "Ajouter aux favoris"} title={bookmarked ? "Retirer des favoris" : "Ajouter aux favoris (Ctrl+D)"}
          className="shrink-0 rounded p-1 text-text-muted hover:text-text disabled:opacity-40">
          {bookmarked ? <BookmarkCheck className="size-4 text-accent" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
        </button>
      </div>

      {tab && tab.zoom !== 100 && (
        <div className="flex shrink-0 items-center text-xs text-text-muted" aria-label="Zoom">
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Réduire le zoom" onClick={() => void api.setZoom(tab.id, "out")}><Minus aria-hidden /></Button>
          <button type="button" className="w-10 tabular-nums hover:text-text" title="Rétablir le zoom (Ctrl+0)" onClick={() => void api.setZoom(tab.id, "reset")}>{tab.zoom} %</button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Augmenter le zoom" onClick={() => void api.setZoom(tab.id, "in")}><Plus aria-hidden /></Button>
        </div>
      )}
      <Button type="button" size="icon-sm" variant="ghost" aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"} title="Plein écran (F11)"
        onClick={() => void api.runCommand("fullscreen")}>
        {fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
      </Button>
      <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
      {([
        ["library", Library, "Favoris, historique et téléchargements"],
        ["settings", Settings, "Réglages du navigateur"],
        ["ai", Sparkles, "Leanna (Ctrl+Maj+L)"],
      ] as const).map(([id, Icon, label]) => (
        <Button key={id} type="button" size="icon-sm" variant={panel === id ? "soft" : "ghost"} aria-label={label} title={label}
          aria-pressed={panel === id} data-panel-toggle={id} onClick={() => onPanel(id)}>
          <Icon aria-hidden />
        </Button>
      ))}
    </form>
  );
}

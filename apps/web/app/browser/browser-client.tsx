"use client";

import * as React from "react";
import {
  ArrowLeft, ArrowRight, Globe, Lock, LoaderCircle, Plus, RotateCw, ShieldAlert, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type BrowserTab = {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPrivate: boolean;
  error?: string;
};
type BrowserState = { activeTabId: string | null; tabs: BrowserTab[] };
type BrowserBounds = { x: number; y: number; width: number; height: number };
type BrowserApi = {
  getBrowserState(): Promise<BrowserState>;
  onBrowserState(callback: (state: BrowserState) => void): () => void;
  createBrowserTab(url?: string, isPrivate?: boolean): Promise<BrowserTab | null>;
  activateBrowserTab(id: string): Promise<boolean>;
  closeBrowserTab(id: string): Promise<boolean>;
  navigateBrowserTab(id: string, address: string): Promise<boolean>;
  browserGoBack(id: string): Promise<boolean>;
  browserGoForward(id: string): Promise<boolean>;
  browserReload(id: string): Promise<boolean>;
  browserStop(id: string): Promise<boolean>;
  setBrowserBounds(bounds: BrowserBounds): Promise<boolean>;
  setBrowserVisible(visible: boolean): Promise<boolean>;
};

function getApi(): BrowserApi | undefined {
  return (window as Window & { leannaDesktop?: BrowserApi }).leannaDesktop;
}

export function BrowserClient() {
  const [available, setAvailable] = React.useState<boolean | null>(null);
  const [state, setState] = React.useState<BrowserState>({ activeTabId: null, tabs: [] });
  const [address, setAddress] = React.useState("");
  const [privateNext, setPrivateNext] = React.useState(false);
  const viewportRef = React.useRef<HTMLDivElement>(null);

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;

  React.useEffect(() => {
    const api = getApi();
    if (!api) {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    let alive = true;
    const unsubscribe = api.onBrowserState((next) => {
      if (alive) setState(next);
    });
    void api.getBrowserState().then(async (current) => {
      if (!alive) return;
      setState(current);
      if (current.tabs.length === 0) await api.createBrowserTab();
      await api.setBrowserVisible(true);
    }).catch(() => {
      if (alive) setAvailable(false);
    });

    return () => {
      alive = false;
      unsubscribe();
      void api.setBrowserVisible(false);
    };
  }, []);

  React.useEffect(() => {
    setAddress(activeTab?.url && activeTab.url !== "about:blank" ? activeTab.url : "");
  }, [activeTab?.id, activeTab?.url]);

  React.useEffect(() => {
    const api = getApi();
    const element = viewportRef.current;
    if (!api || !element || !available) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      void api.setBrowserBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [available]);

  async function createTab() {
    const api = getApi();
    if (!api) return;
    await api.createBrowserTab(undefined, privateNext);
    setPrivateNext(false);
  }

  async function closeTab(event: React.MouseEvent, id: string) {
    event.stopPropagation();
    await getApi()?.closeBrowserTab(id);
  }

  async function navigate(event: React.FormEvent) {
    event.preventDefault();
    if (!activeTab || !address.trim()) return;
    await getApi()?.navigateBrowserTab(activeTab.id, address);
  }

  if (available === false) {
    return (
      <main className="grid min-h-0 flex-1 place-items-center p-6">
        <div className="max-w-md text-center">
          <Globe className="mx-auto size-10 text-text-muted" aria-hidden />
          <h1 className="mt-4 text-lg font-semibold">Leanna Browser nécessite l’application desktop</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Le moteur Chromium intégré utilise Electron WebContentsView. Ouvrez cette page depuis Leanna Notebook Desktop pour naviguer dans l’application.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg">
      <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2">
        {state.tabs.map((tab) => (
          <div
            key={tab.id}
            className={`group flex h-8 min-w-0 max-w-56 shrink-0 items-center gap-2 rounded-md px-2 text-xs ${tab.id === state.activeTabId ? "bg-surface-raised text-text" : "text-text-muted hover:bg-surface-raised"}`}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => void getApi()?.activateBrowserTab(tab.id)}
              title={tab.title || tab.url}
            >
              {tab.loading ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" /> : <Globe className="size-3.5 shrink-0" />}
              <span className="truncate">{tab.title || "Nouvel onglet"}</span>
            </button>
            <button type="button" onClick={(event) => void closeTab(event, tab.id)} className="rounded p-0.5 opacity-60 hover:bg-bg hover:opacity-100" aria-label="Fermer l’onglet">
              <X className="size-3" />
            </button>
          </div>
        ))}
        <Button size="icon-sm" variant="ghost" aria-label="Nouvel onglet" onClick={() => void createTab()}>
          <Plus aria-hidden />
        </Button>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button size="icon-sm" variant={privateNext ? "soft" : "ghost"} aria-label="Prochain onglet privé" title="Prochain onglet privé" onClick={() => setPrivateNext((value) => !value)}>
            <Lock aria-hidden />
          </Button>
        </div>
      </div>

      <form onSubmit={navigate} className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface-raised px-2">
        <Button size="icon-sm" variant="ghost" aria-label="Précédent" disabled={!activeTab?.canGoBack} onClick={() => activeTab && void getApi()?.browserGoBack(activeTab.id)}>
          <ArrowLeft aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Suivant" disabled={!activeTab?.canGoForward} onClick={() => activeTab && void getApi()?.browserGoForward(activeTab.id)}>
          <ArrowRight aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={activeTab?.loading ? "Arrêter" : "Actualiser"} onClick={() => {
          if (!activeTab) return;
          void (activeTab.loading ? getApi()?.browserStop(activeTab.id) : getApi()?.browserReload(activeTab.id));
        }}>
          {activeTab?.loading ? <X aria-hidden /> : <RotateCw aria-hidden />}
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3">
          {activeTab?.isPrivate ? <Lock className="size-3.5 shrink-0 text-text-muted" aria-hidden /> : <ShieldAlert className="size-3.5 shrink-0 text-text-muted" aria-hidden />}
          <input
            aria-label="Adresse web ou recherche"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-subtle"
            placeholder="Rechercher ou saisir une adresse"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <Button type="submit" size="sm" disabled={!activeTab || !address.trim()}>Ouvrir</Button>
      </form>

      {activeTab?.error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-danger/10 px-4 py-2 text-xs text-danger">
          <ShieldAlert className="size-4" aria-hidden />
          La navigation a rencontré une erreur. Vérifiez l’adresse et réessayez.
        </div>
      )}
      <div ref={viewportRef} className="relative min-h-0 flex-1 bg-bg" aria-label="Contenu Chromium" />
    </main>
  );
}

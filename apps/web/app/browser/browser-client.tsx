"use client";

import * as React from "react";
import { Globe, Plus, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getBrowserApi, shouldForwardKey,
  type DesktopBrowserApi, type DesktopBrowserBookmark, type DesktopBrowserCommand, type DesktopBrowserSettings, type DesktopBrowserState,
} from "./browser-api";
import { AiPanel } from "./ai-panel";
import { TabStrip } from "./tab-strip";
import { Toolbar, type BrowserPanel } from "./toolbar";

const EMPTY: DesktopBrowserState = { activeTabId: null, tabs: [], fullscreen: false, downloads: [] };

/**
 * Interface de Leanna Browser. Les pages web sont rendues par des WebContentsView natives, posées par le
 * processus Main sur la zone `viewport` : rien ne doit donc s'afficher par-dessus cette zone (les panneaux
 * sont placés à côté), et la vue est masquée quand on affiche un état d'erreur.
 */
export function BrowserClient({ notebookId }: { notebookId?: string } = {}) {
  // undefined = pas encore déterminé (rendu serveur), null = hors application desktop.
  const [api, setApi] = React.useState<DesktopBrowserApi | null | undefined>(undefined);
  const [state, setState] = React.useState<DesktopBrowserState>(EMPTY);
  const [settings, setSettings] = React.useState<DesktopBrowserSettings | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [panel, setPanel] = React.useState<BrowserPanel | null>(null);
  const [bookmarks, setBookmarks] = React.useState<{ bookmarks: DesktopBrowserBookmark[]; folders: string[] }>({ bookmarks: [], folders: [] });
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const addressRef = React.useRef<HTMLInputElement>(null);

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  const bookmark = activeTab ? bookmarks.bookmarks.find((item) => item.url === activeTab.url) : undefined;
  const ready = Boolean(api && settings);
  // La vue native masquerait notre page d'erreur : on ne l'affiche que pour une page réellement chargée.
  const showView = ready && Boolean(activeTab) && !activeTab?.error && !activeTab?.crashed;

  React.useEffect(() => { setApi(getBrowserApi()); }, []);

  const refreshBookmarks = React.useCallback(() => {
    void api?.getBookmarks().then(setBookmarks).catch(() => undefined);
  }, [api]);

  const togglePanel = React.useCallback((next: BrowserPanel) => {
    setPanel((current) => {
      const value = current === next ? null : next;
      void api?.updateSettings({ aiPanelOpen: value === "ai" }).then(setSettings).catch(() => undefined);
      return value;
    });
  }, [api]);

  const toggleBookmark = React.useCallback(() => {
    if (!api || !activeTab || activeTab.security === "internal") return;
    const action = bookmark ? api.removeBookmark(bookmark.id) : api.addBookmark({ url: activeTab.url, title: activeTab.title });
    void action.then(refreshBookmarks).catch(() => undefined);
  }, [api, activeTab, bookmark, refreshBookmarks]);

  // Les commandes clavier arrivent de Main (touche pressée dans un onglet ou dans l'interface).
  const onCommand = React.useRef<(command: DesktopBrowserCommand) => void>(() => undefined);
  onCommand.current = (command) => {
    if (command === "focus-address") { addressRef.current?.focus(); addressRef.current?.select(); }
    else if (command === "toggle-ai-panel") togglePanel("ai");
    else if (command === "bookmark") toggleBookmark();
    else if (command === "show-history" || command === "show-downloads") setPanel("library");
  };

  React.useEffect(() => {
    if (!api) return;
    let alive = true;
    const offState = api.onState((next) => { if (alive) setState(next); });
    const offCommand = api.onCommand((command) => onCommand.current(command));
    void api.init().then((initial) => {
      if (!alive) return;
      setState(initial.state);
      setSettings(initial.settings);
      setPanel(initial.settings.aiPanelOpen ? "ai" : null);
    }).catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      offState();
      offCommand();
      void api.setVisible(false).catch(() => undefined);
    };
  }, [api]);

  React.useEffect(() => { refreshBookmarks(); }, [refreshBookmarks]);

  React.useEffect(() => {
    if (api && ready) void api.setVisible(showView).catch(() => undefined);
  }, [api, ready, showView, state.activeTabId]);

  // La vue native suit la position et la taille de la zone réservée dans la page.
  React.useEffect(() => {
    const element = viewportRef.current;
    if (!api || !ready || !element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      void api.setBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }).catch(() => undefined);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [api, ready, panel]);

  React.useEffect(() => {
    if (!api) return;
    const onKey = (event: KeyboardEvent) => {
      if (!shouldForwardKey(event)) return;
      event.preventDefault();
      void api.key({ key: event.key, control: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey, alt: event.altKey }).catch(() => undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);

  if (api === undefined) return <main className="min-h-0 flex-1 bg-bg" aria-busy="true" />;

  if (api === null || failed) {
    return (
      <main className="grid min-h-0 flex-1 place-items-center p-6">
        <div className="max-w-md text-center">
          <Globe className="mx-auto size-10 text-text-muted" aria-hidden />
          <h1 className="mt-4 text-lg font-semibold">Leanna Browser nécessite l’application desktop</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            {failed
              ? "Le navigateur n’a pas pu démarrer. Relancez Leanna Notebook Desktop."
              : "Le navigateur intégré s’appuie sur le moteur Chromium de l’application desktop. Ouvrez cette page depuis Leanna Notebook Desktop (version à jour) pour naviguer sans quitter Leanna."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg" data-browser-ready={ready}>
      <TabStrip api={api} state={state} />
      <Toolbar api={api} tab={activeTab} fullscreen={state.fullscreen} bookmarked={Boolean(bookmark)} onToggleBookmark={toggleBookmark}
        panel={panel} onPanel={togglePanel} addressRef={addressRef} />

      <div className="flex min-h-0 flex-1">
        <div ref={viewportRef} className="relative min-w-0 flex-1 bg-surface-sunken" aria-label="Page web" data-browser-viewport>
          {ready && !showView && (
            <div className="absolute inset-0 grid place-items-center p-6" role="alert">
              <div className="max-w-md text-center">
                {!activeTab ? (
                  <>
                    <Globe className="mx-auto size-10 text-text-muted" aria-hidden />
                    <h2 className="mt-4 text-base font-semibold">Aucun onglet ouvert</h2>
                    <Button className="mt-4" onClick={() => void api.createTab()}><Plus aria-hidden />Nouvel onglet</Button>
                  </>
                ) : (
                  <>
                    <TriangleAlert className="mx-auto size-10 text-warning" aria-hidden />
                    <h2 className="mt-4 text-base font-semibold">
                      {activeTab.crashed ? "Cet onglet a cessé de fonctionner" : "Impossible d’afficher cette page"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-text-muted">
                      {activeTab.crashed
                        ? "Le reste du navigateur et vos autres onglets ne sont pas affectés."
                        : activeTab.error?.message}
                    </p>
                    {activeTab.error && <p className="mt-1 break-all font-mono text-xs text-text-subtle">{activeTab.error.url}</p>}
                    <Button className="mt-4" variant="secondary" onClick={() => void api.reload(activeTab.id)}><RotateCw aria-hidden />Réessayer</Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {panel && settings && (
          <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-surface" aria-label="Panneau latéral" data-browser-panel={panel}>
            {panel === "ai"
              ? <AiPanel api={api} tab={activeTab} settings={settings} onSettings={setSettings} notebookId={notebookId}
                  save={async () => ({ ok: false, message: "Enregistrement dans le Notebook indisponible." })} />
              : <PanelContent panel={panel} notebookId={notebookId} />}
          </aside>
        )}
      </div>
    </main>
  );
}

function PanelContent({ panel }: { panel: BrowserPanel; notebookId?: string }) {
  const title = panel === "ai" ? "Leanna" : panel === "library" ? "Bibliothèque" : "Réglages";
  return <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h2>;
}

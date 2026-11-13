"use client";

import * as React from "react";
import { ArrowUpRight, AudioLines, BookmarkPlus, Check, Download, FileText, Globe, Mic, PanelsTopLeft, Plus, RotateCw, Search, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getBrowserApi, shouldForwardKey,
  type DesktopBrowserApi, type DesktopBrowserBookmark, type DesktopBrowserCommand, type DesktopBrowserSettings, type DesktopBrowserState,
} from "./browser-api";
import { AiPanel } from "./ai-panel";
import { VoiceAssistant } from "../notebook/[id]/voice-assistant";
import { LibraryPanel, type LibraryTab } from "./library-panel";
import { saveToNotebook } from "./notebook-save";
import { SettingsPanel } from "./settings-panel";
import { NotebookSaveBar, useTargetNotebook } from "./notebook-save-bar";
import { TabStrip } from "./tab-strip";
import { Toolbar, type BrowserPanel } from "./toolbar";

const DESKTOP_DOWNLOAD_URL = "https://github.com/moonback/leanna-notebook/releases/latest";

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
  const [aiTab, setAiTab] = React.useState<"chat" | "voice">("chat");
  const [libraryTab, setLibraryTab] = React.useState<LibraryTab>("bookmarks");
  const target = useTargetNotebook(notebookId);
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
    else if (command === "show-history" || command === "show-downloads") {
      setLibraryTab(command === "show-history" ? "history" : "downloads");
      setPanel("library");
    }
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
      <main className="relative min-h-0 flex-1 overflow-y-auto bg-bg">
        <div className="mx-auto w-full max-w-7xl px-5 py-7 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between border-b border-border pb-5">
            <div>
              <p className="text-sm font-semibold tracking-tight text-text">Leanna Notebook</p>
              <p className="mt-0.5 text-xs text-text-subtle">Votre espace de connaissance</p>
            </div>
            <a href="https://github.com/moonback/leanna-notebook/releases" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface hover:text-text">
              Notes de version <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </header>

          <section className="grid items-center gap-10 border-b border-border py-12 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-20">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 text-xs font-medium text-accent">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                L’expérience complète sur ordinateur
              </p>
              <h1 className="mt-5 text-balance text-3xl font-semibold leading-[1.12] tracking-[-0.035em] text-text sm:text-4xl lg:text-[3.35rem]">
                Vos sources. Vos idées.
                <span className="block text-accent">Tout au même endroit.</span>
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-text-muted sm:text-base">
                Retrouvez vos documents, vos recherches et vos échanges avec l’IA dans un espace de travail unique.
                Leanna vous aide à comprendre vos sources et à transformer vos connaissances en réalisations concrètes.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg" className="h-11 px-5 text-sm font-semibold">
                  <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 size-4" aria-hidden />
                    Télécharger pour Windows
                  </a>
                </Button>
                <span className="text-xs text-text-subtle">Windows · 64 bits</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-subtle">
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-accent" aria-hidden /> Installation simple</span>
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-accent" aria-hidden /> Application desktop</span>
              </div>
            </div>

            <div className="relative min-w-0">
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_18px_55px_rgba(0,0,0,0.12)]">
                <div className="flex h-11 items-center justify-between border-b border-border px-4">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-text-subtle/40" />
                    <span className="size-2 rounded-full bg-text-subtle/40" />
                    <span className="size-2 rounded-full bg-text-subtle/40" />
                    <span className="ml-3 text-[11px] font-medium text-text-muted">Espace de travail</span>
                  </div>
                  <span className="rounded-md border border-border bg-bg px-2 py-1 text-[10px] text-text-subtle">Leanna Desktop</span>
                </div>
                <div className="grid min-h-[270px] grid-cols-[116px_minmax(0,1fr)] sm:min-h-[330px] sm:grid-cols-[158px_minmax(0,1fr)]">
                  <aside className="border-r border-border bg-bg/70 p-3 sm:p-4">
                    <p className="mb-4 text-[10px] font-semibold text-text">Bibliothèque</p>
                    <div className="space-y-1.5 text-[10px] text-text-muted">
                      <div className="rounded-md bg-accent-soft px-2.5 py-2 font-medium text-on-accent-soft">Vue d’ensemble</div>
                      <div className="rounded-md px-2.5 py-2">Mes notebooks</div>
                      <div className="rounded-md px-2.5 py-2">Toutes les sources</div>
                      <div className="rounded-md px-2.5 py-2">Studio</div>
                    </div>
                    <div className="mt-7 border-t border-border pt-3">
                      <p className="text-[9px] uppercase tracking-wider text-text-subtle">Récemment consulté</p>
                      <div className="mt-3 flex items-center gap-2 text-[10px] text-text-muted"><FileText className="size-3.5 text-accent" /> Projet recherche</div>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-text-muted"><FileText className="size-3.5 text-accent" /> Notes de réunion</div>
                    </div>
                  </aside>
                  <div className="min-w-0 p-4 sm:p-6">
                    <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-text-subtle">Votre espace</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold tracking-tight text-text sm:text-base">Bienvenue dans votre Notebook</h2>
                      <span className="rounded-md bg-accent-soft px-2 py-1 text-[9px] font-medium text-on-accent-soft">Personnel</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 text-[10px] text-text-subtle">
                      <Search className="size-3.5 shrink-0" />
                      Rechercher dans vos sources…
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2.5">
                      <div className="rounded-lg border border-border bg-bg p-3">
                        <FileText className="size-4 text-accent" />
                        <p className="mt-3 text-[10px] font-semibold text-text">Documents</p>
                        <p className="mt-1 text-[9px] text-text-subtle">PDF, pages et notes</p>
                      </div>
                      <div className="rounded-lg border border-border bg-bg p-3">
                        <Search className="size-4 text-accent" />
                        <p className="mt-3 text-[10px] font-semibold text-text">Recherche IA</p>
                        <p className="mt-1 text-[9px] text-text-subtle">Réponses sourcées</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-bg p-3">
                      <div className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-accent"><Mic className="size-3.5" /></div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-text">Leanna & Roxane</p>
                        <p className="mt-0.5 text-[9px] text-text-subtle">Un échange naturel, aussi à la voix</p>
                      </div>
                      <span className="ml-auto size-1.5 rounded-full bg-success" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border bg-bg/70 px-4 py-2.5 text-[9px] text-text-subtle">
                  <span>Vos connaissances, réunies dans un seul espace.</span>
                  <span className="hidden sm:inline">Prêt à explorer</span>
                </div>
              </div>
            </div>
          </section>

          <section className="py-10 sm:py-14">
            <div className="max-w-2xl">
              <p className="text-xs font-medium text-accent">Un espace, plusieurs façons d’avancer</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-text sm:text-2xl">De l’information à la connaissance.</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">Tout ce dont vous avez besoin pour collecter, comprendre et donner forme à vos idées.</p>
            </div>
            <div className="mt-7 grid gap-0 divide-y divide-border border-y border-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
              {([
                [FileText, "Centraliser", "Rassemblez PDF, pages web et notes dans des notebooks organisés."],
                [Search, "Comprendre", "Interrogez vos sources et retrouvez les passages qui justifient les réponses."],
                [Mic, "Échanger", "Discutez naturellement avec Leanna et faites intervenir Roxane à la voix."],
                [PanelsTopLeft, "Créer", "Transformez vos recherches en rapports, fiches et livrables Studio."],
              ] as const).map(([Icon, title, description]) => (
                <article key={title} className="py-5 sm:px-4 lg:px-5">
                  <Icon className="size-4 text-accent" aria-hidden />
                  <h3 className="mt-3 text-sm font-semibold text-text">{title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-text-muted">{description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="max-w-xl">
              <h2 className="text-base font-semibold tracking-tight text-text sm:text-lg">Passez à l’expérience desktop.</h2>
              <p className="mt-1.5 text-sm leading-6 text-text-muted">Installez Leanna Notebook sur Windows et retrouvez votre espace de travail dans une application dédiée.</p>
            </div>
            <Button asChild size="lg" className="h-11 shrink-0 px-5">
              <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 size-4" aria-hidden />
                Télécharger Leanna
              </a>
            </Button>
          </section>

          <footer className="flex flex-col items-start justify-between gap-3 py-7 text-xs text-text-subtle sm:flex-row sm:items-center">
            <span>© {new Date().getFullYear()} Leanna Notebook</span>
            <span>Application Windows · 64 bits</span>
          </footer>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg" data-browser-ready={ready}>
      <TabStrip api={api} state={state} />
      <div className="flex min-w-0 items-center gap-2 border-b border-border pr-2">
        <div className="min-w-0 flex-1">
          <Toolbar api={api} tab={activeTab} fullscreen={state.fullscreen} bookmarked={Boolean(bookmark)} onToggleBookmark={toggleBookmark}
            panel={panel} onPanel={togglePanel} addressRef={addressRef} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={viewportRef} className="relative min-w-0 flex-1 var(--bg)" aria-label="Page web" data-browser-viewport>
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

        {settings && (
          // Toujours monté : la session vocale (Gemini Live) doit survivre à la fermeture du panneau ou à un changement d'onglet.
          <aside className={`${panel ? "flex" : "hidden"} w-[380px] shrink-0 flex-col border-l border-border bg-surface`} aria-label="Panneau latéral" data-browser-panel={panel ?? "closed"}>
            {panel === "ai" && (
              <div role="tablist" aria-label="Mode de Leanna" className="grid shrink-0 grid-cols-2 gap-1 border-b border-border p-1.5">
                {([["chat", "Discussion", Sparkles], ["voice", "Studio vocal", AudioLines]] as const).map(([id, label, Icon]) => (
                  <button key={id} type="button" role="tab" aria-selected={aiTab === id} data-ai-tab={id} onClick={() => setAiTab(id)}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${aiTab === id ? "bg-surface-raised font-medium text-text shadow-sm" : "text-text-muted hover:text-text"}`}>
                    <Icon className="size-3.5" aria-hidden />{label}
                  </button>
                ))}
              </div>
            )}
            {target.selected && (
              <div className={panel === "ai" && aiTab === "voice" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
                <VoiceAssistant key={target.selected} inline notebookId={target.selected} conversationId="" browserApi={api} onOpenCitation={() => undefined}
                  saveBrowserRequest={(request) => saveToNotebook(window.fetch.bind(window), target.selected, request)} />
              </div>
            )}
            {panel === "ai" && aiTab === "voice" && !target.selected && (
              <div className="flex min-h-0 flex-1 flex-col justify-between">
                <p className="p-4 text-sm leading-6 text-text-muted">Choisissez un notebook pour utiliser le Studio vocal : Leanna s’appuiera sur ses sources.</p>
                <div className="border-t border-border p-3"><NotebookSaveBar api={api} tab={activeTab} target={target} /></div>
              </div>
            )}
            {panel === "ai" && (
              <div className={aiTab === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
                <AiPanel api={api} tab={activeTab} settings={settings} onSettings={setSettings} notebookId={notebookId}
                  save={(request) => saveToNotebook(window.fetch.bind(window), target.selected, request)}>
                  <NotebookSaveBar api={api} tab={activeTab} target={target} />
                </AiPanel>
              </div>
            )}
            {panel === "library" && (
              <LibraryPanel api={api} tab={libraryTab} onTab={setLibraryTab} bookmarks={bookmarks} onBookmarksChanged={refreshBookmarks} downloads={state.downloads}
                onOpen={(url) => void (activeTab ? api.navigate(activeTab.id, url) : api.createTab({ url }))} />
            )}
            {panel === "settings" && <SettingsPanel api={api} settings={settings} onSettings={setSettings} />}
          </aside>
        )}
      </div>
    </main>
  );
}


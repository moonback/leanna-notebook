"use client";

import * as React from "react";
import { ArrowUpRight, BookmarkPlus, Check, Download, FileText, Globe, Mic, PanelsTopLeft, Plus, RotateCw, Search, Sparkles, TriangleAlert } from "lucide-react";
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
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden" aria-hidden>
          <div className="absolute -left-40 -top-48 size-[520px] rounded-full bg-accent/15 blur-[110px]" />
          <div className="absolute -right-32 top-8 size-[440px] rounded-full bg-violet-500/10 blur-[110px]" />
          <div className="absolute inset-x-0 top-0 h-full bg-gradient-to-b from-accent/5 via-transparent to-bg" />
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-16 lg:py-20">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl border border-border bg-surface shadow-sm">
                <Globe className="size-5 text-accent" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">Leanna Notebook</p>
                <p className="text-xs text-text-muted">Votre espace de connaissance augmenté</p>
              </div>
            </div>
            <span className="hidden rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium text-text-muted sm:inline-flex">
              Disponible sur Windows
            </span>
          </header>

          <section className="grid items-center gap-12 pb-14 pt-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:pb-20 lg:pt-20">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft/70 px-3 py-1.5 text-xs font-medium text-on-accent-soft">
                <Sparkles className="size-3.5" aria-hidden />
                Leanna prend une nouvelle dimension sur desktop
              </div>
              <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Vos idées méritent
                <span className="block text-accent">un espace sans limites.</span>
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-text-muted sm:text-lg sm:leading-8">
                Réunissez vos documents, vos recherches et vos conversations IA dans une seule application.
                Avec Leanna Desktop, passez de l’information à des connaissances claires et des contenus prêts à partager.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg" className="h-12 px-6 text-sm font-semibold shadow-lg shadow-accent/15">
                  <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 size-4" aria-hidden />
                    Télécharger Leanna pour Windows
                  </a>
                </Button>
                <a href="https://github.com/moonback/leanna-notebook/releases" target="_blank" rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text">
                  Voir les versions
                  <ArrowUpRight className="size-4" aria-hidden />
                </a>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-subtle">
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-accent" aria-hidden /> Installateur Windows 64 bits</span>
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-accent" aria-hidden /> Application Electron</span>
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-accent" aria-hidden /> Installation personnalisable</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-5 rounded-[2rem] bg-accent/10 blur-3xl" aria-hidden />
              <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl shadow-black/10">
                <div className="flex items-center gap-2 border-b border-border bg-surface/90 px-4 py-3">
                  <span className="size-2.5 rounded-full bg-red-400/80" />
                  <span className="size-2.5 rounded-full bg-amber-400/80" />
                  <span className="size-2.5 rounded-full bg-emerald-400/80" />
                  <div className="ml-3 flex h-7 min-w-0 flex-1 items-center rounded-md border border-border bg-bg px-3 text-[10px] text-text-subtle">
                    <Globe className="mr-2 size-3 shrink-0" aria-hidden />
                    Leanna Notebook · votre espace de travail
                  </div>
                </div>
                <div className="grid min-h-[300px] grid-cols-[112px_1fr] sm:min-h-[340px] sm:grid-cols-[145px_1fr]">
                  <aside className="border-r border-border bg-bg/70 p-3">
                    <div className="mb-5 flex items-center gap-2 text-[10px] font-semibold">
                      <div className="grid size-5 place-items-center rounded-md bg-accent text-white"><Sparkles className="size-3" /></div>
                      Leanna
                    </div>
                    <div className="space-y-2 text-[10px] text-text-muted">
                      <div className="rounded-md bg-accent-soft px-2 py-2 font-medium text-on-accent-soft">Vue d’ensemble</div>
                      <div className="px-2 py-1.5">Mes notebooks</div>
                      <div className="px-2 py-1.5">Sources</div>
                      <div className="px-2 py-1.5">Studio</div>
                    </div>
                    <div className="mt-8 rounded-lg border border-border bg-surface p-2">
                      <div className="mb-2 flex items-center gap-1.5 text-[9px] font-medium"><Sparkles className="size-3 text-accent" /> Assistant IA</div>
                      <div className="h-1.5 w-full rounded-full bg-border" />
                      <div className="mt-1.5 h-1.5 w-3/4 rounded-full bg-border" />
                    </div>
                  </aside>
                  <div className="p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.16em] text-text-subtle">Votre espace</p>
                        <p className="mt-1 text-sm font-semibold sm:text-base">Bienvenue dans Leanna</p>
                      </div>
                      <div className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent"><Sparkles className="size-4" /></div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-border bg-bg/60 p-3">
                        <FileText className="size-4 text-accent" />
                        <p className="mt-3 text-[10px] font-semibold">Vos documents</p>
                        <p className="mt-1 text-[9px] text-text-subtle">Sources centralisées</p>
                      </div>
                      <div className="rounded-lg border border-border bg-bg/60 p-3">
                        <Search className="size-4 text-accent" />
                        <p className="mt-3 text-[10px] font-semibold">Recherche IA</p>
                        <p className="mt-1 text-[9px] text-text-subtle">Réponses avec sources</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <div className="grid size-6 place-items-center rounded-md bg-accent-soft text-accent"><Sparkles className="size-3.5" /></div>
                        <p className="text-[10px] font-semibold">Leanna & Roxane</p>
                        <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[8px] font-medium text-emerald-600">Prêtes à aider</span>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <div className="h-1.5 w-full rounded-full bg-border" />
                        <div className="h-1.5 w-5/6 rounded-full bg-border" />
                        <div className="h-1.5 w-2/3 rounded-full bg-border" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-[10px] font-medium text-white">
                      <Sparkles className="size-3.5" /> Transformez vos sources en idées concrètes
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border bg-bg/70 px-4 py-2 text-[9px] text-text-subtle">
                  <span>Un seul espace. Toutes vos connaissances.</span>
                  <span>Leanna Desktop</span>
                </div>
              </div>
              <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-lg sm:flex">
                <div className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent"><Mic className="size-4" /></div>
                <div><p className="text-[10px] font-semibold">Travaillez à la voix</p><p className="text-[9px] text-text-subtle">Leanna et Roxane</p></div>
              </div>
            </div>
          </section>

          <section className="border-t border-border py-12 sm:py-16">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Tout se rejoint</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Un espace de travail pensé pour aller plus loin.</h2>
              <p className="mt-3 text-sm leading-6 text-text-muted">Moins d’outils dispersés. Plus de continuité entre vos sources, vos idées et vos réalisations.</p>
            </div>
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {([
                [FileText, "Centralisez", "Rassemblez PDF, pages web et notes dans des notebooks organisés."],
                [Search, "Comprenez", "Interrogez vos sources et retrouvez les passages qui étayent les réponses."],
                [Mic, "Échangez", "Discutez naturellement avec Leanna et faites intervenir Roxane à la voix."],
                [PanelsTopLeft, "Créez", "Transformez vos recherches en rapports, fiches, quiz et autres livrables Studio."],
              ] as const).map(([Icon, title, description]) => (
                <article key={title} className="rounded-xl border border-border bg-surface/80 p-5 transition-colors hover:border-accent/40">
                  <div className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon className="size-5" aria-hidden /></div>
                  <h3 className="mt-4 text-sm font-semibold">{title}</h3>
                  <p className="mt-2 text-xs leading-5 text-text-muted">{description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-accent/20 bg-accent-soft/40 px-6 py-9 text-center sm:px-10 sm:py-12">
            <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-accent/10 blur-3xl" aria-hidden />
            <div className="relative mx-auto max-w-2xl">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-accent/20 bg-surface text-accent shadow-sm"><Download className="size-5" /></div>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">Prêt à travailler avec Leanna ?</h2>
              <p className="mt-3 text-sm leading-6 text-text-muted">Installez l’application Windows et retrouvez votre espace de connaissance dans une expérience desktop dédiée.</p>
              <Button asChild size="lg" className="mt-6 h-12 px-6">
                <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 size-4" aria-hidden />
                  Télécharger Leanna Desktop
                </a>
              </Button>
              <p className="mt-3 text-[11px] text-text-subtle">Le téléchargement ouvre la page officielle des dernières versions GitHub.</p>
            </div>
          </section>

          <footer className="flex flex-col items-center justify-between gap-3 py-8 text-xs text-text-subtle sm:flex-row">
            <span>© {new Date().getFullYear()} Leanna Notebook</span>
            <a href="https://github.com/moonback/leanna-notebook/releases" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-text">Versions et notes de mise à jour</a>
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
        {target.selected && <VoiceAssistant key={target.selected} notebookId={target.selected} conversationId="" browserApi={api} onOpenCitation={() => undefined}
          saveBrowserRequest={(request) => saveToNotebook(window.fetch.bind(window), target.selected, request)} />}
      </div>

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
              ? (
                <AiPanel api={api} tab={activeTab} settings={settings} onSettings={setSettings} notebookId={notebookId}
                  save={(request) => saveToNotebook(window.fetch.bind(window), target.selected, request)}>
                  <NotebookSaveBar api={api} tab={activeTab} target={target} />
                </AiPanel>
              )
              : panel === "library"
                ? <LibraryPanel api={api} tab={libraryTab} onTab={setLibraryTab} bookmarks={bookmarks} onBookmarksChanged={refreshBookmarks} downloads={state.downloads}
                    onOpen={(url) => void (activeTab ? api.navigate(activeTab.id, url) : api.createTab({ url }))} />
                : <SettingsPanel api={api} settings={settings} onSettings={setSettings} />}
          </aside>
        )}
      </div>
    </main>
  );
}


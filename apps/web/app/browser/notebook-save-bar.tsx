"use client";

import * as React from "react";
import { BookPlus, FileText, Link2, Sparkles, TextSelect } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DesktopBrowserApi, DesktopBrowserTab, DesktopSaveRequest } from "./browser-api";
import { saveToNotebook, summarizePage, type SaveResult } from "./notebook-save";

type Notebook = { id: string; title: string };
const STORAGE_KEY = "leanna-browser-notebook";

/** Notebook de destination : celui de la page si le navigateur est ouvert depuis un notebook, sinon au choix. */
export function useTargetNotebook(fixedId?: string) {
  const [notebooks, setNotebooks] = React.useState<Notebook[]>([]);
  const [selected, setSelected] = React.useState<string | null>(fixedId ?? null);
  React.useEffect(() => {
    if (fixedId) return;
    let alive = true;
    void fetch("/api/v1/notebooks").then((response) => response.ok ? response.json() : { items: [] }).then((data: { items?: Notebook[] }) => {
      if (!alive) return;
      const items = (data.items ?? []).map((item) => ({ id: item.id, title: item.title || "Sans titre" }));
      setNotebooks(items);
      let remembered: string | null = null;
      try { remembered = window.localStorage.getItem(STORAGE_KEY); } catch { /* stockage indisponible */ }
      setSelected(items.find((item) => item.id === remembered)?.id ?? items[0]?.id ?? null);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [fixedId]);
  const choose = (id: string) => {
    setSelected(id);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* stockage indisponible */ }
  };
  return { notebooks, selected, choose, fixed: Boolean(fixedId) };
}

type Props = {
  api: DesktopBrowserApi;
  tab: DesktopBrowserTab | null;
  target: ReturnType<typeof useTargetNotebook>;
};

/** « Ajouter au Notebook » : lien seul, contenu, contenu + synthèse IA, ou texte sélectionné. */
export function NotebookSaveBar({ api, tab, target }: Props) {
  const [busy, setBusy] = React.useState<DesktopSaveRequest["mode"] | null>(null);
  const [result, setResult] = React.useState<SaveResult | null>(null);
  const usable = Boolean(tab && tab.security !== "internal" && !tab.error && !tab.crashed);

  React.useEffect(() => { setResult(null); }, [tab?.id, tab?.url]);

  async function add(mode: DesktopSaveRequest["mode"]) {
    if (!tab || busy) return;
    setBusy(mode);
    setResult(null);
    try {
      const request: DesktopSaveRequest = { mode, url: tab.url, title: tab.title, favicon: tab.favicon };
      if (mode === "selection") {
        request.text = await api.getSelection(tab.id);
        if (!request.text.trim()) { setResult({ ok: false, message: "Sélectionnez d’abord du texte dans la page." }); return; }
      } else if (mode !== "link") {
        const page = await api.extractPage(tab.id, { full: true });
        if (page.status !== "ok") { setResult({ ok: false, message: "Le contenu de cette page est indisponible : rien n’a été enregistré." }); return; }
        request.title = page.title || tab.title;
        request.text = page.text;
        if (mode === "summary") request.summary = await summarizePage(window.fetch.bind(window), await api.extractPage(tab.id), target.selected ?? undefined);
      }
      setResult(await saveToNotebook(window.fetch.bind(window), target.selected, request));
    } catch {
      setResult({ ok: false, message: "L’enregistrement a échoué. Réessayez." });
    } finally {
      setBusy(null);
    }
  }

  const actions = [
    ["link", Link2, "Lien", "Ajouter seulement le lien : Leanna ira lire la page."],
    ["text", FileText, "Contenu", "Ajouter le texte de la page tel que vous le voyez."],
    ["summary", Sparkles, "Contenu + synthèse", "Ajouter le texte de la page et une note de synthèse rédigée par Leanna."],
    ["selection", TextSelect, "Sélection", "Ajouter le texte sélectionné dans la page."],
  ] as const;

  return (
    <section className="mb-2 rounded-md border border-border bg-surface-sunken p-2" aria-label="Ajouter au Notebook" data-notebook-save>
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-text">
        <BookPlus className="size-3.5" aria-hidden />
        <span className="shrink-0">Ajouter au Notebook</span>
        {!target.fixed && (
          <select aria-label="Notebook de destination" value={target.selected ?? ""} onChange={(event) => target.choose(event.target.value)}
            className="ml-auto h-7 min-w-0 max-w-44 rounded border border-border-input bg-surface-raised px-1 text-xs font-normal">
            {target.notebooks.length === 0 && <option value="">Aucun notebook</option>}
            {target.notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.title}</option>)}
          </select>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {actions.map(([mode, Icon, label, hint]) => (
          <Button key={mode} size="sm" variant="secondary" className="justify-start px-2 text-xs" title={hint} data-save-mode={mode}
            disabled={!usable || !target.selected || Boolean(busy)} loading={busy === mode} onClick={() => void add(mode)}>
            {busy !== mode && <Icon aria-hidden />}{label}
          </Button>
        ))}
      </div>
      {result && <p role="status" className={`mt-1.5 text-xs ${result.ok ? "text-success" : "text-danger"}`}>{result.message}</p>}
    </section>
  );
}

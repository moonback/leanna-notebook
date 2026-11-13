"use client";

import * as React from "react";
import { Check, FolderOpen, FolderPlus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/field";
import { Progress } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { formatBytes, hostOf, type DesktopBrowserApi, type DesktopBrowserBookmark, type DesktopBrowserDownload, type DesktopBrowserVisit } from "./browser-api";

export type LibraryTab = "bookmarks" | "history" | "downloads";
type Props = {
  api: DesktopBrowserApi;
  tab: LibraryTab;
  onTab: (tab: LibraryTab) => void;
  bookmarks: { bookmarks: DesktopBrowserBookmark[]; folders: string[] };
  onBookmarksChanged: () => void;
  downloads: DesktopBrowserDownload[];
  /** Ouvre une adresse enregistrée dans l'onglet actif. */
  onOpen: (url: string) => void;
};

const input = "h-8 w-full rounded-md border border-border-input bg-surface-raised px-2 text-sm outline-none focus-visible:border-focus";
const row = "group flex min-w-0 items-center gap-1 rounded-md px-2 py-1.5 hover:bg-surface-raised";
const iconButton = "shrink-0 rounded p-1 text-text-muted hover:bg-surface-sunken hover:text-text";

/** Favoris (dossiers, renommage, recherche), historique (recherche, suppressions) et téléchargements. */
export function LibraryPanel({ api, tab, onTab, bookmarks, onBookmarksChanged, downloads, onOpen }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-library-panel>
      <div role="tablist" aria-label="Bibliothèque" className="flex shrink-0 gap-1 border-b border-border p-2">
        {([["bookmarks", "Favoris"], ["history", "Historique"], ["downloads", "Téléchargements"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-library-tab={id} onClick={() => onTab(id)}
            className={cn("rounded-md px-2.5 py-1.5 text-xs", tab === id ? "bg-accent-soft font-medium text-on-accent-soft" : "text-text-muted hover:bg-surface-raised")}>
            {label}{id === "downloads" && downloads.some((d) => d.state === "progressing") ? " •" : ""}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "bookmarks" && <Bookmarks api={api} data={bookmarks} onChanged={onBookmarksChanged} onOpen={onOpen} />}
        {tab === "history" && <History api={api} onOpen={onOpen} />}
        {tab === "downloads" && <Downloads api={api} downloads={downloads} />}
      </div>
    </div>
  );
}

function Bookmarks({ api, data, onChanged, onOpen }: { api: DesktopBrowserApi; data: Props["bookmarks"]; onChanged: () => void; onOpen: (url: string) => void }) {
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; title: string } | null>(null);
  const [folderEdit, setFolderEdit] = React.useState<{ from: string; name: string } | null>(null);
  const [newFolder, setNewFolder] = React.useState("");
  const q = query.trim().toLowerCase();
  const visible = data.bookmarks.filter((item) => !q || item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q));
  const run = (action: Promise<unknown>) => void action.then(onChanged).catch(() => undefined);

  return (
    <div className="grid gap-2">
      <SearchInput aria-label="Rechercher dans les favoris" placeholder="Rechercher un favori" value={query} onChange={(event) => setQuery(event.target.value)} />
      <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); if (newFolder.trim()) { run(api.addFolder(newFolder)); setNewFolder(""); } }}>
        <input aria-label="Nom du nouveau dossier" className={input} placeholder="Nouveau dossier" value={newFolder} maxLength={60} onChange={(event) => setNewFolder(event.target.value)} />
        <Button type="submit" size="icon-sm" variant="secondary" aria-label="Créer le dossier" disabled={!newFolder.trim()}><FolderPlus aria-hidden /></Button>
      </form>
      {visible.length === 0 && (q || data.folders.length === 0) && <p className="px-2 py-6 text-center text-xs text-text-muted">{q ? "Aucun favori ne correspond." : "Aucun favori. Utilisez l’icône de la barre d’adresse (Ctrl+D)."}</p>}
      {["", ...data.folders].map((folder) => {
        const items = visible.filter((item) => item.folder === folder);
        if (folder === "" && items.length === 0) return null;
        if (folder !== "" && q && items.length === 0) return null;
        return (
          <section key={folder || "racine"} aria-label={folder || "Favoris sans dossier"} data-folder={folder}>
            {folder !== "" && (
              <div className="flex items-center gap-1 px-2 pt-2 text-xs font-semibold text-text-muted">
                {folderEdit?.from === folder ? (
                  <form className="flex flex-1 gap-1" onSubmit={(event) => { event.preventDefault(); run(api.renameFolder(folder, folderEdit.name)); setFolderEdit(null); }}>
                    <input autoFocus aria-label="Nouveau nom du dossier" className={input} value={folderEdit.name} maxLength={60} onChange={(event) => setFolderEdit({ from: folder, name: event.target.value })} />
                    <button type="submit" className={iconButton} aria-label="Valider le nom"><Check className="size-3.5" /></button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 truncate">{folder}</span>
                    <button type="button" className={iconButton} aria-label={`Renommer le dossier ${folder}`} onClick={() => setFolderEdit({ from: folder, name: folder })}><Pencil className="size-3" /></button>
                    <button type="button" className={iconButton} aria-label={`Supprimer le dossier ${folder}`} title="Supprimer le dossier (ses favoris sont conservés)" onClick={() => run(api.removeFolder(folder))}><Trash2 className="size-3" /></button>
                  </>
                )}
              </div>
            )}
            <ul>
              {items.map((item) => (
                <li key={item.id} className={row}>
                  {editing?.id === item.id ? (
                    <form className="flex flex-1 gap-1" onSubmit={(event) => { event.preventDefault(); run(api.updateBookmark(item.id, { title: editing.title })); setEditing(null); }}>
                      <input autoFocus aria-label="Nouveau titre du favori" className={input} value={editing.title} maxLength={300} onChange={(event) => setEditing({ id: item.id, title: event.target.value })} />
                      <button type="submit" className={iconButton} aria-label="Valider le titre"><Check className="size-3.5" /></button>
                    </form>
                  ) : (
                    <>
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(item.url)}>
                        <span className="block truncate text-sm">{item.title}</span>
                        <span className="block truncate text-xs text-text-muted">{hostOf(item.url)}</span>
                      </button>
                      {data.folders.length > 0 && (
                        <select aria-label={`Dossier de ${item.title}`} value={item.folder} className="h-7 max-w-24 rounded border border-border-input bg-surface-raised text-xs"
                          onChange={(event) => run(api.updateBookmark(item.id, { folder: event.target.value }))}>
                          <option value="">Sans dossier</option>
                          {data.folders.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                      )}
                      <button type="button" className={iconButton} aria-label={`Renommer ${item.title}`} onClick={() => setEditing({ id: item.id, title: item.title })}><Pencil className="size-3.5" /></button>
                      <button type="button" className={iconButton} aria-label={`Supprimer le favori ${item.title}`} onClick={() => run(api.removeBookmark(item.id))}><X className="size-3.5" /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const PERIODS = [["hour", "Dernière heure", 3_600_000], ["day", "24 dernières heures", 86_400_000], ["week", "7 derniers jours", 604_800_000], ["all", "Tout l’historique", 0]] as const;

function History({ api, onOpen }: { api: DesktopBrowserApi; onOpen: (url: string) => void }) {
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<DesktopBrowserVisit[]>([]);
  const [period, setPeriod] = React.useState<typeof PERIODS[number][0]>("hour");
  const [notice, setNotice] = React.useState("");
  const load = React.useCallback(() => { void api.getHistory(query).then(setItems).catch(() => undefined); }, [api, query]);
  React.useEffect(load, [load]);

  async function clear() {
    const duration = PERIODS.find(([id]) => id === period)![2];
    const removed = await api.clearHistory(duration ? Date.now() - duration : undefined);
    setNotice(`${removed} entrée${removed > 1 ? "s" : ""} supprimée${removed > 1 ? "s" : ""}.`);
    load();
  }

  return (
    <div className="grid gap-2">
      <SearchInput aria-label="Rechercher dans l’historique" placeholder="Rechercher dans l’historique" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="flex items-center gap-1">
        <select aria-label="Période à effacer" className="h-8 min-w-0 flex-1 rounded-md border border-border-input bg-surface-raised px-1 text-xs" value={period}
          onChange={(event) => setPeriod(event.target.value as typeof period)}>
          {PERIODS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <Button size="sm" variant="secondary" onClick={() => void clear()}><Trash2 aria-hidden />Effacer</Button>
      </div>
      {notice && <p role="status" className="px-2 text-xs text-text-muted">{notice}</p>}
      {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-text-muted">{query ? "Aucune page ne correspond." : "Aucune page dans l’historique."}</p>}
      <ul>
        {items.map((item) => (
          <li key={item.id} className={row}>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(item.url)}>
              <span className="block truncate text-sm">{item.title}</span>
              <span className="block truncate text-xs text-text-muted">
                {new Date(item.visitedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {hostOf(item.url)}
              </span>
            </button>
            <button type="button" className={iconButton} aria-label={`Supprimer ${item.title} de l’historique`} onClick={() => void api.removeVisit(item.id).then(load)}><X className="size-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DOWNLOAD_STATE: Record<DesktopBrowserDownload["state"], string> = {
  progressing: "En cours", paused: "En pause", completed: "Terminé", cancelled: "Annulé", interrupted: "Interrompu",
};

function Downloads({ api, downloads }: { api: DesktopBrowserApi; downloads: DesktopBrowserDownload[] }) {
  if (downloads.length === 0) return <p className="px-2 py-6 text-center text-xs text-text-muted">Aucun téléchargement. Les fichiers ne sont jamais ouverts automatiquement.</p>;
  return (
    <ul className="grid gap-1">
      {downloads.map((item) => {
        const live = item.state === "progressing" || item.state === "paused";
        return (
          <li key={item.id} className="rounded-md border border-border bg-surface-raised p-2" data-download={item.state}>
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={item.path}>{item.filename}</p>
                <p className="truncate text-xs text-text-muted">
                  {DOWNLOAD_STATE[item.state]} · {formatBytes(item.receivedBytes)}{item.totalBytes > 0 ? ` / ${formatBytes(item.totalBytes)}` : ""}
                  {item.risky ? " · fichier exécutable" : ""}
                </p>
              </div>
              {live && <button type="button" className={iconButton} aria-label={`Annuler le téléchargement de ${item.filename}`} onClick={() => void api.cancelDownload(item.id)}><X className="size-3.5" /></button>}
              {item.state === "completed" && <button type="button" className={iconButton} aria-label={`Afficher ${item.filename} dans son dossier`} title="Afficher dans le dossier" onClick={() => void api.showDownloadInFolder(item.id)}><FolderOpen className="size-3.5" /></button>}
              {!live && <button type="button" className={iconButton} aria-label={`Retirer ${item.filename} de la liste`} title="Retirer de la liste (le fichier est conservé)" onClick={() => void api.removeDownload(item.id)}><Trash2 className="size-3.5" /></button>}
            </div>
            {live && <div className="mt-1.5"><Progress label={`Progression de ${item.filename}`} value={item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : undefined} /></div>}
          </li>
        );
      })}
    </ul>
  );
}

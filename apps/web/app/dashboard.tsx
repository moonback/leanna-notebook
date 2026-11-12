"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Globe, LayoutGrid, List, Lock, MoreVertical, Pencil, Plus, SearchX, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { AppHeader } from "@/components/app/app-header";
import { Button } from "@/components/ui/button";
import { Field, Input, SearchInput } from "@/components/ui/field";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Dialog, DialogClose, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Card, Table, Td, Th, Tr } from "@/components/ui/surfaces";
import { toast } from "@/components/ui/toast";

export type NotebookRow = { id: string; title: string; emoji: string | null; createdAt: string; lastActivityAt: string; sourceCount: number; owned: boolean; isPublic: boolean };
type Tab = "all" | "mine" | "shared";

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const titleOf = (n: NotebookRow) => n.title || "Notebook sans titre";
const sources = (n: number) => `${n} source${n > 1 ? "s" : ""}`;

export function Dashboard({ initial, loadError, initialView }: { initial: NotebookRow[]; loadError: boolean; initialView: "grid" | "list"; name: string | null }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [tab, setTab] = React.useState<Tab>("all");
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState(initialView);
  const [creating, setCreating] = React.useState(false);
  const [renaming, setRenaming] = React.useState<NotebookRow | null>(null);
  const [deleting, setDeleting] = React.useState<NotebookRow | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  React.useEffect(() => { setItems(initial); }, [initial]);

  async function togglePublic(n: NotebookRow) {
    const next = !n.isPublic;
    const ok = await confirm(next
      ? { title: "Rendre ce notebook public ?", description: "Toute personne disposant du lien pourra le lire, et il apparaîtra dans « Découvrir ». Vos conversations et notes restent privées.", confirmLabel: "Rendre public", tone: "primary" }
      : { title: "Retirer l’accès public ?", description: "Le lien public cessera de fonctionner et le notebook disparaîtra de « Découvrir ».", confirmLabel: "Rendre privé" });
    if (!ok) return;
    const res = await fetch(`/api/v1/notebooks/${n.id}/public`, { method: next ? "POST" : "DELETE" }).catch(() => null);
    if (!res?.ok) { toast({ title: "Réglage non enregistré", tone: "error" }); return; }
    setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, isPublic: next } : x)));
    const url = next ? (await res.json()).url as string | null : null;
    if (url) await navigator.clipboard?.writeText(url).then(() => toast({ title: "Notebook public", description: "Lien copié.", tone: "success" }), () => toast({ title: "Notebook public", tone: "success" }));
    else toast({ title: next ? "Notebook public" : "Notebook privé", tone: "success" });
  }

  const visible = items.filter((n) => (tab === "all" || (tab === "mine") === n.owned) && fold(titleOf(n)).includes(fold(query.trim())));

  async function create() {
    setCreating(true);
    try {
      const res = await fetch("/api/v1/notebooks", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const json = await res.json();
      if (res.status === 409 && json.error === "max_notebooks") {
        toast({ title: "Limite de notebooks atteinte", description: `Votre offre permet ${json.limit} notebooks. Supprimez-en un ou changez d’offre dans les réglages.`, tone: "error" });
        return;
      }
      if (!res.ok) throw new Error();
      router.push(`/notebook/${json.notebook.id}`);
    } catch {
      toast({ title: "Création impossible", description: "Réessayez dans un instant.", tone: "error" });
    } finally { setCreating(false); }
  }

  async function changeView(v: "grid" | "list") {
    setView(v);
    await fetch("/api/v1/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dashboard_view: v }) }).catch(() => {});
  }

  const actions = (n: NotebookRow) => n.owned && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Actions pour ${titleOf(n)}`} className="relative z-10"><MoreVertical aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem icon={<Pencil aria-hidden />} onSelect={() => setRenaming(n)}>Renommer</DropdownMenuItem>
        <DropdownMenuItem icon={n.isPublic ? <Lock aria-hidden /> : <Globe aria-hidden />} onSelect={() => void togglePublic(n)}>{n.isPublic ? "Rendre privé" : "Rendre public"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger icon={<Trash2 aria-hidden />} onSelect={() => setDeleting(n)}>Supprimer</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
    {confirmDialog}
    <AppHeader>
      <SearchInput aria-label="Rechercher un notebook" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} className="mx-auto w-full max-w-md" />
      <Button size="sm" className="shrink-0" onClick={create} loading={creating}><Plus aria-hidden /> <span className="hidden sm:inline">Nouveau notebook</span><span className="sr-only sm:hidden">Nouveau notebook</span></Button>
    </AppHeader>
    <main className="mx-auto grid max-w-[var(--page-max-w)] gap-6 px-4 py-8 sm:px-6">
      {loadError && <Alert tone="danger" title="Impossible de charger vos notebooks" action={<Button size="sm" variant="secondary" onClick={() => router.refresh()}>Réessayer</Button>} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => { if (v === "discover") router.push("/discover"); else setTab(v as Tab); }}>
          <TabsList aria-label="Filtrer les notebooks">
            <TabsTrigger value="all">Tous</TabsTrigger>
            <TabsTrigger value="mine">Les miens</TabsTrigger>
            <TabsTrigger value="shared">Partagés avec moi</TabsTrigger>
            <TabsTrigger value="discover">Découvrir</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div role="group" aria-label="Affichage" className="flex shrink-0 rounded-md border p-0.5">
            <Button size="icon-sm" variant={view === "grid" ? "soft" : "ghost"} aria-label="Grille" aria-pressed={view === "grid"} onClick={() => changeView("grid")}><LayoutGrid aria-hidden /></Button>
            <Button size="icon-sm" variant={view === "list" ? "soft" : "ghost"} aria-label="Liste" aria-pressed={view === "list"} onClick={() => changeView("list")}><List aria-hidden /></Button>
          </div>
        </div>
      </div>

      {items.length === 0 && !loadError ? (
        <Card>
          <EmptyState icon={<BookOpen />} title="Créez votre premier notebook" action={<Button onClick={create} loading={creating}><Plus aria-hidden /> Nouveau notebook</Button>}>
            Ajoutez-y des PDF, des pages web ou du texte : vous pourrez ensuite poser des questions et chaque réponse citera ses passages.
          </EmptyState>
        </Card>
      ) : visible.length === 0 ? (
        <Card><EmptyState icon={<SearchX />} title="Aucun résultat">Aucun notebook ne correspond à ce filtre.</EmptyState></Card>
      ) : view === "grid" ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((n) => (
            <li key={n.id}>
              <Card interactive className="grid h-full gap-6 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span aria-hidden className="grid size-10 place-items-center rounded-lg bg-accent-soft text-lg">{n.emoji ?? <BookOpen className="size-4 text-on-accent-soft" />}</span>
                  {actions(n)}
                </div>
                <div className="min-w-0">
                  <Link href={`/notebook/${n.id}`} className="line-clamp-2 font-semibold after:absolute after:inset-0">{titleOf(n)}</Link>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-text-subtle"><Visibility isPublic={n.isPublic} /> {sources(n.sourceCount)} · {fmt.format(new Date(n.createdAt))}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <caption className="sr-only">Notebooks</caption>
            <thead><tr><Th>Titre</Th><Th className="hidden sm:table-cell">Sources</Th><Th className="hidden md:table-cell" aria-sort="none">Création</Th><Th className="hidden md:table-cell">Rôle</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {visible.map((n) => (
                <Tr key={n.id} className="relative">
                  <Td className="max-w-0 w-full">
                    <Link href={`/notebook/${n.id}`} className="flex min-w-0 items-center gap-2.5 font-medium after:absolute after:inset-0">
                      <span aria-hidden className="shrink-0">{n.emoji ?? "📘"}</span><span className="truncate">{titleOf(n)}</span><Visibility isPublic={n.isPublic} />
                    </Link>
                  </Td>
                  <Td className="hidden whitespace-nowrap text-text-muted sm:table-cell">{sources(n.sourceCount)}</Td>
                  <Td className="hidden whitespace-nowrap text-text-muted md:table-cell">{fmt.format(new Date(n.createdAt))}</Td>
                  <Td className="hidden md:table-cell"><Badge>{n.owned ? "Propriétaire" : "Partagé"}</Badge></Td>
                  <Td className="w-12">{actions(n)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <RenameDialog notebook={renaming} onClose={() => setRenaming(null)} onDone={(id, title) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, title } : x)))} />
      <DeleteDialog notebook={deleting} onClose={() => setDeleting(null)} onDone={(id) => setItems((xs) => xs.filter((x) => x.id !== id))} />
    </main>
    </>
  );
}

/** Pastille de visibilité : globe = public, cadenas = privé. */
function Visibility({ isPublic }: { isPublic: boolean }) {
  const label = isPublic ? "Public" : "Privé";
  const Icon = isPublic ? Globe : Lock;
  return (
    <span title={label} className={`inline-flex shrink-0 items-center ${isPublic ? "text-accent" : "text-text-subtle"}`}>
      <Icon aria-hidden className="size-3.5" /><span className="sr-only">{label}</span>
    </span>
  );
}

function RenameDialog({ notebook, onClose, onDone }: { notebook: NotebookRow | null; onClose: () => void; onDone: (id: string, title: string) => void }) {
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { setTitle(notebook?.title ?? ""); setError(undefined); }, [notebook]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!notebook) return;
    if (title.trim().length > 200) return setError("200 caractères maximum.");
    setSaving(true);
    const res = await fetch(`/api/v1/notebooks/${notebook.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim() }) });
    setSaving(false);
    if (!res.ok) return setError("Enregistrement impossible. Réessayez.");
    onDone(notebook.id, title.trim());
    onClose();
  }
  return (
    <Dialog open={Boolean(notebook)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title="Renommer le notebook">
        <form onSubmit={save} className="grid gap-4">
          <Field id="rename" label="Titre" error={error}><Input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="secondary">Annuler</Button></DialogClose>
            <Button type="submit" loading={saving}>Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ notebook, onClose, onDone }: { notebook: NotebookRow | null; onClose: () => void; onDone: (id: string) => void }) {
  const [busy, setBusy] = React.useState(false);
  async function remove() {
    if (!notebook) return;
    setBusy(true);
    const res = await fetch(`/api/v1/notebooks/${notebook.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return toast({ title: "Suppression impossible", tone: "error" });
    onDone(notebook.id);
    onClose();
    toast({ title: "Notebook supprimé", tone: "success" });
  }
  return (
    <Dialog open={Boolean(notebook)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title={`Supprimer « ${notebook ? titleOf(notebook) : ""} » ?`} description={`${notebook ? sources(notebook.sourceCount) : ""}, les notes et les conversations seront supprimées définitivement.`}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="secondary">Annuler</Button></DialogClose>
          <Button variant="danger" loading={busy} onClick={remove}>Supprimer définitivement</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

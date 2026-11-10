"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Copy, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/field";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Card } from "@/components/ui/surfaces";
import { toast } from "@/components/ui/toast";

export type FeaturedNotebook = {
  id: string; title: string; emoji: string | null; overview: string | null;
  allowCopies: boolean; createdAt: string;
};
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const titleOf = (n: FeaturedNotebook) => n.title || "Notebook sans titre";

export function Discover({ initial, loadError }: { initial: FeaturedNotebook[]; loadError: boolean }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const items = initial.filter((n) => fold(titleOf(n) + " " + (n.overview ?? "")).includes(fold(query.trim())));

  async function openNotebook(id: string) {
    const response = await fetch(`/api/v1/discover/${id}/open`, { method: "POST" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "open_failed");
    return json.notebookId as string;
  }

  async function explore(id: string) {
    setBusy(id);
    try { const notebookId = await openNotebook(id); router.push(`/notebook/${notebookId}`); }
    catch { toast({ title: "Notebook indisponible", description: "Cette sélection n’est peut-être plus publiée.", tone: "error" }); }
    finally { setBusy(null); }
  }

  async function copy(id: string) {
    setBusy(id);
    try {
      await openNotebook(id);
      const response = await fetch(`/api/v1/notebooks/${id}/copy`, { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "copy_failed");
      toast({ title: "Copie créée", description: "Le notebook a été ajouté à votre bibliothèque.", tone: "success" });
      router.push(`/notebook/${json.notebook.id}`);
    } catch (e) {
      const code = e instanceof Error ? e.message : "copy_failed";
      const description = code === "max_notebooks" ? "La limite de votre offre est atteinte." : "La copie n’a pas pu être créée. Réessayez.";
      toast({ title: "Copie impossible", description, tone: "error" });
    } finally { setBusy(null); }
  }

  return (
    <main className="mx-auto grid max-w-[var(--page-max-w)] gap-6 px-4 py-8 sm:px-6">
      <header className="grid gap-2">
        <div className="flex items-center gap-2 text-sm text-accent"><Sparkles aria-hidden className="size-4" /> Sélections éditoriales</div>
        <h1 className="text-2xl font-semibold">Découvrir des notebooks</h1>
        <p className="max-w-2xl text-sm text-text-muted">Explorez des notebooks sélectionnés par l’équipe. Ouvrez-les en lecture ou copiez-les dans votre bibliothèque lorsque cette option est proposée.</p>
      </header>
      <SearchInput aria-label="Rechercher dans les notebooks à découvrir" placeholder="Rechercher un sujet ou un notebook" value={query} onChange={(e) => setQuery(e.target.value)} />
      {loadError && <Alert tone="danger" title="Impossible de charger les sélections" />}
      {!loadError && initial.length === 0 ? (
        <Card><EmptyState icon={<BookOpen />} title="Les sélections arrivent bientôt">Aucun notebook éditorial n’est publié pour le moment. Revenez découvrir les prochaines sélections.</EmptyState></Card>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={<Search />} title="Aucun résultat">Essayez un autre mot-clé.</EmptyState></Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((n) => (
            <li key={n.id}>
              <Card className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-xl" aria-hidden>{n.emoji ?? "📘"}</span>
                  <Badge tone="accent">Sélection</Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{titleOf(n)}</h2>
                  <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm text-text-muted">{n.overview || "Un notebook sélectionné pour explorer ce sujet."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void explore(n.id)} loading={busy === n.id}><BookOpen aria-hidden /> Explorer</Button>
                  {n.allowCopies && <Button size="sm" onClick={() => void copy(n.id)} loading={busy === n.id}><Copy aria-hidden /> Copier</Button>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

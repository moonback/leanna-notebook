import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { Card } from "@/components/ui/surfaces";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic"; // la dépublication doit être effective immédiatement

type Props = { params: Promise<{ slug: string }> };
const SLUG = /^[A-Za-z0-9_-]{16,64}$/;

async function load(slug: string) {
  if (!SLUG.test(slug)) return null;
  const db = createServiceClient();
  const { data: nb } = await db.from("notebooks")
    .select("id, title, emoji, overview, published_at").eq("public_slug", slug).maybeSingle();
  if (!nb) return null;
  // Colonnes explicites : jamais de texte extrait, de notes, de conversations ni de chemins de stockage.
  const [{ data: sources }, { data: artifacts }] = await Promise.all([
    db.from("sources").select("id, title, kind").eq("notebook_id", nb.id).eq("status", "ready").neq("kind", "note").order("created_at"),
    db.from("artifacts").select("id, type, title, content").eq("notebook_id", nb.id).eq("status", "ready").order("created_at", { ascending: false }),
  ]);
  return { nb, sources: sources ?? [], artifacts: artifacts ?? [] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug);
  return {
    title: data ? `${data.nb.title || "Notebook"} · Notebook public` : "Notebook",
    robots: { index: false, follow: false },
  };
}

function readable(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const c = content as Record<string, unknown>;
  if (typeof c.markdown === "string") return c.markdown;
  if (typeof c.text === "string") return c.text;
  if (Array.isArray(c.cards)) {
    return c.cards.map((x, i) => { const k = x as Record<string, unknown>; return `${i + 1}. ${String(k.front ?? k.question ?? "Carte")}\n${String(k.back ?? k.answer ?? "")}`; }).join("\n\n");
  }
  if (Array.isArray(c.questions)) {
    return c.questions.map((x, i) => { const q = x as Record<string, unknown>; return `${i + 1}. ${String(q.question ?? "Question")}\n${String(q.explanation ?? "")}`; }).join("\n\n");
  }
  return "";
}

/** Notebook public : lecture seule, sans compte. */
export default async function PublicNotebookPage({ params }: Props) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const { nb, sources, artifacts } = data;
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-10">
        <div className="text-xs font-medium uppercase tracking-wide text-text-muted">Notebook public · Lecture seule</div>
        <Card className="grid gap-4 p-6 sm:p-8">
          <h1 className="text-2xl font-semibold">{nb.emoji ? `${nb.emoji} ` : ""}{nb.title || "Notebook sans titre"}</h1>
          {nb.overview && <p className="whitespace-pre-wrap break-words text-sm leading-7 text-text">{nb.overview}</p>}
        </Card>
        {sources.length > 0 && (
          <Card className="grid gap-3 p-6">
            <h2 className="text-lg font-semibold">Sources ({sources.length})</h2>
            <ul className="grid gap-1 text-sm text-text-muted">
              {sources.map((s) => <li key={s.id}>{s.title || "Source sans titre"} <span className="text-xs">· {String(s.kind).replaceAll("_", " ")}</span></li>)}
            </ul>
          </Card>
        )}
        {artifacts.map((a) => {
          const text = readable(a.content);
          return (
            <Card key={a.id} className="grid gap-3 p-6">
              <h2 className="text-lg font-semibold">{a.title || String(a.type).replaceAll("_", " ")}</h2>
              {text ? <article className="whitespace-pre-wrap break-words text-sm leading-7 text-text">{text}</article>
                : <p className="text-sm text-text-muted">Contenu non consultable en ligne.</p>}
            </Card>
          );
        })}
        <p className="text-center text-xs text-text-muted">
          Les conversations et notes privées ne sont pas partagées. <Link className="underline" href="/">Découvrir Notebook</Link>
        </p>
      </main>
    </div>
  );
}

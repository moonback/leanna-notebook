import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { Card } from "@/components/ui/surfaces";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic"; // revocation et suppression vérifiées à chaque ouverture

export const metadata: Metadata = {
  title: "Contenu partagé · Notebook",
  robots: { index: false, follow: false },
};

type PublicArtifact = {
  id: string;
  type: string;
  title: string | null;
  content: Record<string, unknown> | null;
  created_at: string;
};

function readableContent(content: Record<string, unknown> | null): string {
  if (!content) return "";
  if (typeof content.markdown === "string") return content.markdown;
  if (typeof content.text === "string") return content.text;
  if (Array.isArray(content.cards)) {
    return content.cards.map((item, i) => {
      const card = item as Record<string, unknown>;
      return `${i + 1}. ${String(card.front ?? card.question ?? "Carte")}\n${String(card.back ?? card.answer ?? "")}`;
    }).join("\n\n");
  }
  if (Array.isArray(content.questions)) {
    return content.questions.map((item, i) => {
      const q = item as Record<string, unknown>;
      return `${i + 1}. ${String(q.question ?? "Question")}\n${String(q.explanation ?? "")}`;
    }).join("\n\n");
  }
  return JSON.stringify(content, null, 2);
}

/** H04 : accès anonyme en lecture seule à un artefact uniquement. */
export default async function PublicArtifactPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) notFound();

  const hash = createHash("sha256").update(token, "utf8").digest("hex");
  const db = createServiceClient();
  const { data: link } = await db.from("share_links")
    .select("artifact_id")
    .eq("token_hash", `\\x${hash}`)
    .eq("scope", "artifact")
    .is("revoked_at", null)
    .single();
  if (!link?.artifact_id) notFound();

  const { data } = await db.from("artifacts")
    .select("id, type, title, content, created_at, status")
    .eq("id", link.artifact_id)
    .single();
  if (!data || data.status !== "ready") notFound();

  const artifact = data as PublicArtifact;
  const content = readableContent(artifact.content);
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-10">
        <div className="text-xs font-medium uppercase tracking-wide text-text-muted">Contenu partagé · Lecture seule</div>
        <Card className="grid gap-5 p-6 sm:p-8">
          <header className="grid gap-2 border-b border-border pb-5">
            <h1 className="text-2xl font-semibold">{artifact.title || "Contenu Notebook"}</h1>
            <p className="text-sm text-text-muted">{artifact.type.replaceAll("_", " ")} · {new Date(artifact.created_at).toLocaleDateString("fr-FR")}</p>
          </header>
          {content ? (
            <article className="whitespace-pre-wrap break-words text-sm leading-7 text-text">
              {content}
            </article>
          ) : (
            <p className="text-sm text-text-muted">Ce contenu ne contient pas de texte consultable.</p>
          )}
        </Card>
        <p className="text-center text-xs text-text-muted">
          Ce lien donne accès à ce contenu uniquement, pas au notebook ni à ses sources. <Link className="underline" href="/">Découvrir Notebook</Link>
        </p>
      </main>
    </div>
  );
}

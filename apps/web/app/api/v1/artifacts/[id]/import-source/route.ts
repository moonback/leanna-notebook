import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";
import { NOTE_MAX_CHARS } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };
type Node = { label?: string; children?: Node[] };

/** Texte lisible d'un contenu généré, quel que soit son type. */
function toText(content: Record<string, unknown> | null): string {
  if (!content) return "";
  if (typeof content.markdown === "string") return content.markdown;
  if (Array.isArray(content.cards)) {
    return content.cards.map((c: { front?: string; back?: string }, i) => `## ${i + 1}. ${c.front ?? ""}\n\n${c.back ?? ""}`).join("\n\n");
  }
  if (Array.isArray(content.questions)) {
    return content.questions.map((q: { question?: string; choices?: string[]; answer?: number; explanation?: string }, i) => {
      const choices = (q.choices ?? []).map((c, k) => `- ${c}${k === q.answer ? " (bonne réponse)" : ""}`).join("\n");
      return `## ${i + 1}. ${q.question ?? ""}\n\n${choices}${q.explanation ? `\n\n${q.explanation}` : ""}`;
    }).join("\n\n");
  }
  if (content.root) {
    const walk = (n: Node, depth: number): string => `${"  ".repeat(depth)}- ${n.label ?? ""}\n${(n.children ?? []).map((c) => walk(c, depth + 1)).join("")}`;
    return walk(content.root as Node, 0);
  }
  return "";
}

/** Importe un contenu du Studio comme source (note) du carnet : il devient sélectionnable et citable. */
export const POST = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");

  const db = createServiceClient();
  const { data: art } = await db.from("artifacts").select("id, notebook_id, type, title, status, content").eq("id", id).single();
  if (!art || art.status !== "ready") throw new ApiError(404, "not_found");
  await requireRole(art.notebook_id, "editor");

  // Les pastilles [n] renvoient à des citations de l'artefact : sans objet dans une source.
  const text = toText(art.content as Record<string, unknown> | null).replace(/\s*\[\d+\]/g, "").trim().slice(0, NOTE_MAX_CHARS);
  if (!text) throw new ApiError(422, "not_importable");
  const title = `${(art.title?.trim() || "Contenu du Studio").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 290)}.md`;

  // Source de type fichier Markdown, comme un .md importé depuis l'ordinateur.
  const { data: nb } = await db.from("notebooks").select("workspace_id").eq("id", art.notebook_id).single();
  if (!nb) throw new ApiError(404, "not_found");
  const body = new Blob([text], { type: "text/markdown" });
  const path = `${nb.workspace_id}/${art.notebook_id}/${crypto.randomUUID()}/original.md`;
  const { error: upErr } = await db.storage.from("sources").upload(path, body, { contentType: "text/markdown" });
  if (upErr) throw upErr;

  const { data: sourceId, error } = await db.rpc("add_source", {
    p_notebook: art.notebook_id, p_user: user.id, p_kind: "md", p_title: title,
    p_storage_path: path, p_mime_type: "text/markdown", p_size_bytes: body.size,
    p_idempotency_key: `import-artifact:${user.id}:${art.id}`, // un double clic ne crée pas deux sources
  });
  if (error) {
    await db.storage.from("sources").remove([path]); // pas de fichier orphelin
    if (String(error.message).includes("duplicate key")) throw new ApiError(409, "already_imported");
    throw error;
  }
  log.info("artifact.imported_as_source", { artifact_id: id, source_id: sourceId as string });
  return NextResponse.json({ source: { id: sourceId, title, status: "pending" } }, { status: 201 });
});

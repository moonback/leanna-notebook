import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { createUserClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

type Params = { params: Promise<{ id: string }> };

function slug(value: string) {
  return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "notebook";
}
function markdown(type: string, title: string, value: unknown): string {
  const content = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof content.markdown === "string") return `# ${title}\\n\\n${content.markdown}`;
  if (type === "flashcards" && Array.isArray(content.cards)) return `# ${title}\\n\\n${content.cards.map((raw, i) => {
    const card = raw as { front?: string; back?: string };
    return `## Carte ${i + 1}\\n\\n**Question**\\n\\n${card.front ?? ""}\\n\\n**Réponse**\\n\\n${card.back ?? ""}`;
  }).join("\\n\\n---\\n\\n")}`;
  if (type === "quiz" && Array.isArray(content.questions)) return `# ${title}\\n\\n${content.questions.map((raw, i) => {
    const q = raw as { question?: string; choices?: string[]; answer?: number; explanation?: string };
    return `## ${i + 1}. ${q.question ?? ""}\\n\\n${(q.choices ?? []).map((choice, n) => `- ${n === q.answer ? "**" : ""}${choice}${n === q.answer ? " — bonne réponse**" : ""}`).join("\\n")}\\n\\n${q.explanation ?? ""}`;
  }).join("\\n\\n")}`;
  if (type === "mind_map" && content.root && typeof content.root === "object") {
    const lines = [`# ${title}`];
    const walk = (raw: unknown, depth: number) => {
      if (!raw || typeof raw !== "object") return;
      const node = raw as { label?: string; children?: unknown[] };
      lines.push(`${"  ".repeat(depth)}- ${node.label ?? "Thème"}`);
      for (const child of node.children ?? []) walk(child, depth + 1);
    };
    walk(content.root, 0);
    return lines.join("\\n");
  }
  return `# ${title}\\n\\n\`\`\`json\\n${JSON.stringify(value, null, 2)}\\n\`\`\``;
}

/** Compilation Markdown de tous les contenus Studio prêts du notebook. */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  await requireRole(id, "viewer");
  const db = await createUserClient();
  const [{ data: notebook }, { data: artifacts, error }] = await Promise.all([
    db.from("notebooks").select("title").eq("id", id).single(),
    db.from("artifacts").select("id, type, title, status, content, created_at")
      .eq("notebook_id", id).eq("status", "ready").order("created_at", { ascending: true }),
  ]);
  if (error) throw error;
  const title = notebook?.title || "Notebook";
  const documents = (artifacts ?? []).map((artifact, index) => {
    const content = artifact.type === "audio" && artifact.content && typeof artifact.content === "object"
      ? Object.fromEntries(Object.entries(artifact.content as Record<string, unknown>).filter(([key]) => key !== "audio_path"))
      : artifact.content;
    return `## ${index + 1}. ${artifact.title || artifact.type}\\n\\n_Type : ${artifact.type} · Créé le ${new Date(artifact.created_at).toLocaleString("fr-FR")}_\\n\\n${markdown(artifact.type, artifact.title || artifact.type, content)}`;
  });
  const body = `# ${title} — Studio\\n\\nExport Markdown · ${artifacts?.length ?? 0} contenu(s) prêt(s)\\n\\n${documents.join("\\n\\n---\\n\\n")}\\n`;
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slug(title)}-studio.md"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

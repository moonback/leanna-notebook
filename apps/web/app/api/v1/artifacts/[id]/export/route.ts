import { NextRequest } from "next/server";
import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
type ExportFormat = "md" | "txt" | "json" | "html" | "mp3";

async function artifactNotebook(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  const { data } = await createServiceClient().from("artifacts").select("notebook_id").eq("id", id).single();
  if (!data) throw new ApiError(404, "not_found");
  return data.notebook_id as string;
}

function markdownContent(type: string, title: string, value: unknown): string {
  const content = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof content.markdown === "string") return `# ${title}\n\n${content.markdown}\n`;
  if (type === "flashcards" && Array.isArray(content.cards)) {
    return `# ${title}\n\n${content.cards.map((card, i) => {
      const item = card as { front?: string; back?: string };
      return `## Carte ${i + 1}\n\n**Question**\n\n${item.front ?? ""}\n\n**Réponse**\n\n${item.back ?? ""}`;
    }).join("\n\n---\n\n")}\n`;
  }
  if (type === "quiz" && Array.isArray(content.questions)) {
    return `# ${title}\n\n${content.questions.map((question, i) => {
      const q = question as { question?: string; choices?: string[]; answer?: number; explanation?: string };
      return `## ${i + 1}. ${q.question ?? ""}\n\n${(q.choices ?? []).map((choice, n) => `- ${n === q.answer ? "**" : ""}${choice}${n === q.answer ? " — bonne réponse**" : ""}`).join("\n")}\n\n${q.explanation ?? ""}`;
    }).join("\n\n")}\n`;
  }
  if (type === "mind_map" && content.root && typeof content.root === "object") {
    const lines = [`# ${title}`];
    const walk = (node: unknown, depth: number) => {
      if (!node || typeof node !== "object") return;
      const item = node as { label?: string; children?: unknown[] };
      lines.push(`${"  ".repeat(depth)}- ${item.label ?? "Thème"}`);
      for (const child of item.children ?? []) walk(child, depth + 1);
    };
    walk(content.root, 0);
    return lines.join("\n") + "\n";
  }
  return "# " + title + "\n\n```json\n" + JSON.stringify(value, null, 2) + "\n```\n";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Téléchargement d'un artefact Studio dans un format portable, après contrôle d'accès au notebook. */
export const GET = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(await artifactNotebook(id), "viewer");
  const format = (req.nextUrl.searchParams.get("format") ?? "md") as ExportFormat;
  if (!["md", "txt", "json", "html", "mp3"].includes(format)) throw new ApiError(422, "unsupported_export_format");

  const supabase = await createUserClient();
  const { data: artifact, error } = await supabase.from("artifacts")
    .select("id, type, title, status, content").eq("id", id).single();
  if (error || !artifact) throw new ApiError(404, "not_found");
  if (artifact.status !== "ready") throw new ApiError(409, "artifact_not_ready");
  if (format === "mp3") {
    if (artifact.type !== "audio") throw new ApiError(422, "unsupported_export_format");
    const audioPath = (artifact.content as { audio_path?: string } | null)?.audio_path;
    if (!audioPath) throw new ApiError(404, "audio_file_not_found");
    const { data: audio, error: audioError } = await createServiceClient().storage.from("artifacts").download(audioPath);
    if (audioError || !audio) throw new ApiError(404, "audio_file_not_found");
    return new Response(audio, {
      headers: {
        "content-type": "audio/mpeg",
        "content-disposition": `attachment; filename="audio-overview-${id}.mp3"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const title = artifact.title || "Leanna Notebook";
  const markdown = markdownContent(artifact.type, title, artifact.content);
  const jsonContent = artifact.type === "audio" && artifact.content && typeof artifact.content === "object"
    ? Object.fromEntries(Object.entries(artifact.content as Record<string, unknown>).filter(([key]) => key !== "audio_path"))
    : artifact.content;
  const body = format === "json"
    ? JSON.stringify({ title, type: artifact.type, content: jsonContent }, null, 2)
    : format === "txt"
      ? markdown.replace(/^#{1,6}\s+/gm, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/^[-*] /gm, "• ")
      : format === "html"
        ? `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><body><main><h1>${escapeHtml(title)}</h1><pre style="white-space:pre-wrap;font:inherit;line-height:1.6">${escapeHtml(markdown)}</pre></main></body></html>`
        : markdown;
  const slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "document";
  const contentType = format === "json" ? "application/json; charset=utf-8" : format === "html" ? "text/html; charset=utf-8" : format === "txt" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8";
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${slug}.${format}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

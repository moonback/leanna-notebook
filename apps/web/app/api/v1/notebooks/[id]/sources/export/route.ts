import { ApiError, handle, requireRole, requireUser } from "@/lib/api";
import { createUserClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

type Params = { params: Promise<{ id: string }> };

function slug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "notebook";
}

/** Export Markdown des sources prêtes d'un notebook ; ids filtre la sélection. */
export const GET = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found");
  await requireRole(id, "viewer");

  const format = req.nextUrl.searchParams.get("format") ?? "md";
  if (format !== "md") throw new ApiError(422, "unsupported_export_format");
  const hasIds = req.nextUrl.searchParams.has("ids");
  const requested = req.nextUrl.searchParams.get("ids");
  if (hasIds && !requested) throw new ApiError(422, "invalid_source_ids");
  const ids = requested ? [...new Set(requested.split(",").filter(Boolean))] : null;
  if (ids && (!ids.length || ids.length > 600 || ids.some((value) => !/^[0-9a-f-]{36}$/i.test(value)))) {
    throw new ApiError(422, "invalid_source_ids");
  }

  const db = await createUserClient();
  let query = db.from("sources")
    .select("id, kind, title, status, extracted_text, word_count, page_count, origin_url, created_at")
    .eq("notebook_id", id).eq("status", "ready").order("created_at", { ascending: true });
  if (ids) query = query.in("id", ids);
  const [{ data: sources, error }, { data: notebook }] = await Promise.all([
    query,
    db.from("notebooks").select("title").eq("id", id).single(),
  ]);
  if (error) throw error;
  if (ids && (sources ?? []).length !== ids.length) throw new ApiError(404, "source_not_found");

  const title = notebook?.title || "Notebook";
  const sections = (sources ?? []).map((source, index) => {
    const metadata = [
      `- Type : ${source.kind}`,
      source.origin_url ? `- Source : ${source.origin_url}` : null,
      source.word_count ? `- Mots : ${source.word_count}` : null,
      source.page_count ? `- Pages : ${source.page_count}` : null,
      `- Ajoutée le : ${new Date(source.created_at).toLocaleString("fr-FR")}`,
    ].filter(Boolean).join("\n");
    return `## ${index + 1}. ${source.title || "Source sans titre"}\n\n${metadata}\n\n${source.extracted_text?.trim() || "_Aucun texte extrait._"}`;
  });
  const body = `# ${title} — Sources\n\nExport Markdown · ${sources?.length ?? 0} source(s) prête(s)\n\n${sections.join("\n\n---\n\n")}\n`;
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slug(title)}-sources.md"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

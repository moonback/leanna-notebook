import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseBody, requireRole, requireUser } from "@/lib/api";
import { log } from "@/lib/log";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { sourcesCreateSchema, uploadTypeOf, UPLOAD_TYPES } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

/** Sources du notebook + désélections personnelles (lecture sous RLS, sans le texte extrait). */
export const GET = handle(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "viewer");
  const supabase = await createUserClient();
  const [sources, deselected] = await Promise.all([
    supabase.from("sources").select("id, kind, title, status, error_code, word_count, page_count, created_at, updated_at")
      .eq("notebook_id", id).order("created_at"),
    supabase.from("source_deselections").select("source_id").eq("notebook_id", id).eq("user_id", user.id),
  ]);
  if (sources.error) throw sources.error;
  return NextResponse.json({ sources: sources.data, deselected: (deselected.data ?? []).map((d) => d.source_id) });
});

/**
 * Ajout de sources : réponse 202 immédiate, l'extraction se fait dans le worker (job ingest_source).
 * Le client suit `sources.status` / `jobs.progress` (Realtime ou GET).
 */
export const POST = handle(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await requireRole(id, "editor");
  const { items } = await parseBody(req, sourcesCreateSchema);
  const db = createServiceClient();
  const { data: nb } = await db.from("notebooks").select("workspace_id").eq("id", id).single();
  if (!nb) throw new ApiError(404, "not_found");
  const prefix = `${nb.workspace_id}/${id}/`;
  const idem = req.headers.get("idempotency-key");

  const created: { id: string; title: string }[] = [];
  for (const [i, item] of items.entries()) {
    let args: Record<string, unknown>;
    if (item.type === "upload") {
      // Le chemin doit être celui que NOUS avons émis pour CE notebook (pas d'accès au fichier d'un autre tenant).
      if (!item.storagePath.startsWith(prefix) || item.storagePath.includes("..")) throw new ApiError(403, "forbidden");
      const ext = uploadTypeOf(item.storagePath);
      if (!ext) throw new ApiError(415, "unsupported_type");
      const dir = item.storagePath.slice(0, item.storagePath.lastIndexOf("/"));
      const { data: files } = await db.storage.from("sources").list(dir);
      const file = files?.find((f) => item.storagePath.endsWith(`/${f.name}`));
      if (!file) throw new ApiError(422, "upload_missing");
      args = { p_kind: UPLOAD_TYPES[ext][1], p_title: item.title, p_storage_path: item.storagePath,
               p_mime_type: UPLOAD_TYPES[ext][0], p_size_bytes: file.metadata?.size ?? null };
    } else if (item.type === "url") {
      args = { p_kind: "web", p_title: new URL(item.url).hostname, p_origin_url: item.url };
    } else if (item.type === "github") {
      const parsed = new URL(item.url);
      const [owner, repository] = parsed.pathname.split("/").filter(Boolean);
      const repoName = repository.replace(/\.git$/i, "");
      const ref = encodeURIComponent(item.branch);
      args = { p_kind: "github", p_title: `${owner}/${repoName} · ${item.branch}`.slice(0, 300), p_origin_url: `https://github.com/${owner}/${repoName}?ref=${ref}` };
    } else {
      const path = `${prefix}${crypto.randomUUID()}/original.txt`;
      const { error } = await db.storage.from("sources").upload(path, new Blob([item.text], { type: "text/plain" }));
      if (error) throw error;
      args = { p_kind: "text", p_title: item.title, p_storage_path: path, p_mime_type: "text/plain", p_size_bytes: new Blob([item.text]).size };
    }
    const { data, error } = await db.rpc("add_source", {
      p_notebook: id, p_user: user.id, ...args,
      p_idempotency_key: idem ? `${user.id}:${id}:${idem}:${i}` : null,
    });
    if (error) throw error;
    created.push({ id: data as string, title: String(args.p_title) });
  }
  log.info("sources.added", { notebook_id: id, user_id: user.id, count: created.length });
  return NextResponse.json({ sources: created.map((s) => ({ ...s, status: "pending" })) }, { status: 202 });
});

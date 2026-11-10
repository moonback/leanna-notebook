import { NextResponse } from "next/server";
import { createServiceClient, getUser } from "@/lib/supabase/server";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

type Db = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;
const PAGE = 1000; // plafond PostgREST par requête
const SIGNED_URL_TTL = 7 * 24 * 3600;

/** Lit toute une requête par pages (le serveur plafonne à 1000 lignes). */
async function all(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

const idsOf = (rows: Row[]) => rows.map((r) => r.id as string);
const chunked = <T,>(list: T[], n = 200) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Lecture `in (...)` par lots, pour ne pas dépasser la longueur d'URL. */
async function allIn(db: Db, table: string, column: string, values: string[], select = "*"): Promise<Row[]> {
  const out: Row[] = [];
  for (const part of chunked(values)) {
    out.push(...(await all((f, t) => db.from(table).select(select).in(column, part).range(f, t) as never)));
  }
  return out;
}

async function signed(db: Db, bucket: string, rows: Row[]): Promise<void> {
  for (const r of rows) {
    if (typeof r.storage_path !== "string") continue;
    const { data } = await db.storage.from(bucket).createSignedUrl(r.storage_path, SIGNED_URL_TTL);
    r.download_url = data?.signedUrl ?? null;
  }
}

/**
 * Export RGPD (art. 15 et 20) : toutes les données de l'utilisateur en JSON, avec des liens signés
 * (7 jours) vers les fichiers d'origine. Les contenus des espaces qu'il possède sont inclus en entier ;
 * pour les notebooks d'autrui, seulement ce qu'il a lui-même produit (conversations, progression).
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  const db = createServiceClient();
  const uid = user.id;

  try {
    const [profile, workspaces, memberships, notebookMemberships] = await Promise.all([
      db.from("profiles").select("*").eq("id", uid).single(),
      all((f, t) => db.from("workspaces").select("*").eq("owner_id", uid).range(f, t)),
      all((f, t) => db.from("workspace_members").select("*").eq("user_id", uid).range(f, t)),
      all((f, t) => db.from("notebook_members").select("*").eq("user_id", uid).range(f, t)),
    ]);
    const wsIds = idsOf(workspaces);
    const notebooks = await allIn(db, "notebooks", "workspace_id", wsIds);
    const nbIds = idsOf(notebooks);

    const [sources, artifacts, labels, members, links, collections, conversations, messages, progress, reads, deselections, usage, reports, audit] = await Promise.all([
      allIn(db, "sources", "notebook_id", nbIds, "id, notebook_id, kind, title, status, origin_url, storage_path, mime_type, size_bytes, language, word_count, page_count, extracted_text, note_body, guide, label_id, created_at, updated_at"),
      allIn(db, "artifacts", "notebook_id", nbIds, "id, notebook_id, type, title, status, options, custom_prompt, source_ids, content, storage_path, mime_type, duration_ms, created_at, updated_at"),
      allIn(db, "source_labels", "notebook_id", nbIds),
      allIn(db, "notebook_members", "notebook_id", nbIds, "id, notebook_id, user_id, invited_email, role, created_at"),
      allIn(db, "share_links", "notebook_id", nbIds, "id, notebook_id, artifact_id, scope, revoked_at, created_at"), // jamais le hachage du jeton
      all((f, t) => db.from("collections").select("*, collection_notebooks(notebook_id)").eq("owner_id", uid).range(f, t)),
      all((f, t) => db.from("conversations").select("*").eq("user_id", uid).range(f, t)),
      all((f, t) => db.from("chat_messages").select("id, notebook_id, conversation_id, role, content, status, source_ids, model, feedback, feedback_reason, created_at").eq("user_id", uid).order("created_at").range(f, t)),
      all((f, t) => db.from("study_progress").select("*").eq("user_id", uid).range(f, t)),
      all((f, t) => db.from("artifact_reads").select("*").eq("user_id", uid).range(f, t)),
      all((f, t) => db.from("source_deselections").select("*").eq("user_id", uid).range(f, t)),
      all((f, t) => db.from("usage_ledger").select("*").eq("user_id", uid).range(f, t)),
      all((f, t) => db.from("reports").select("id, kind, category, body, created_at").eq("reporter_id", uid).range(f, t)),
      all((f, t) => db.from("audit_log").select("*").eq("actor_id", uid).range(f, t)),
    ]);
    const citations = await allIn(db, "citations", "message_id", idsOf(messages), "message_id, marker, source_id, quote_text, char_start, char_end, verified");

    await Promise.all([signed(db, "sources", sources), signed(db, "artifacts", artifacts)]);

    const body = {
      exported_at: new Date().toISOString(),
      account: { id: uid, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at },
      profile: profile.data,
      workspaces,
      workspace_memberships: memberships,
      notebook_memberships: notebookMemberships,
      notebooks: notebooks.map((n) => ({
        ...n,
        sources: sources.filter((s) => s.notebook_id === n.id),
        source_labels: labels.filter((l) => l.notebook_id === n.id),
        artifacts: artifacts.filter((a) => a.notebook_id === n.id),
        members: members.filter((m) => m.notebook_id === n.id),
        share_links: links.filter((l) => l.notebook_id === n.id),
      })),
      collections,
      conversations: conversations.map((c) => ({ ...c, messages: messages.filter((m) => m.conversation_id === c.id).map((m) => ({ ...m, citations: citations.filter((x) => x.message_id === m.id) })) })),
      study_progress: progress,
      artifact_reads: reads,
      source_deselections: deselections,
      usage,
      reports,
      audit_log: audit,
      notes: "Les liens download_url sont signés et valables 7 jours. Le détail des passages indexés (chunks) et des embeddings n'est pas inclus : il se déduit du texte des sources.",
    };
    log.info("account.exported", { user_id: uid, notebooks: notebooks.length });
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="notebook-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    log.error("account.export_failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}

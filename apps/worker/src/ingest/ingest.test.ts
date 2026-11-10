// Intégration : upload → job asynchrone → chunks indexés, et isolation stricte entre deux clients.
import { readFileSync, existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOnce } from "../worker.ts";
import { ingestHandler } from "./handler.ts";

const envFile = new URL("../../.env", import.meta.url);
const env: Record<string, string> = existsSync(envFile)
  ? Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
  : {};

describe.skipIf(!env.SUPABASE_ANON_KEY)("ingestion + isolation (intégration)", () => {
  let admin: SupabaseClient, asB: SupabaseClient;
  const users: string[] = [];
  let nb: string, src: string, path: string;
  const password = `pw-${crypto.randomUUID()}`;

  beforeAll(async () => {
    admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const mk = async (tag: string) => {
      const { data, error } = await admin.auth.admin.createUser({ email: `${tag}-${Date.now()}@test.local`, password, email_confirm: true });
      if (error) throw error;
      users.push(data.user.id);
      return data.user;
    };
    const a = await mk("a"), b = await mk("b");
    const ws = (await admin.from("workspaces").select("id").eq("owner_id", a.id).single()).data!.id;
    nb = (await admin.from("notebooks").insert({ workspace_id: ws, created_by: a.id, title: "A" }).select("id").single()).data!.id;
    path = `${ws}/${nb}/${crypto.randomUUID()}/original.txt`;
    const text = "Le protocole DMX pilote les projecteurs.\n\nArt-Net transporte le DMX sur un réseau Ethernet. ".repeat(40);
    expect((await admin.storage.from("sources").upload(path, new Blob([text], { type: "text/plain" }))).error).toBeNull();
    src = (await admin.rpc("add_source", { p_notebook: nb, p_user: a.id, p_kind: "txt", p_title: "notes.txt", p_storage_path: path })).data as string;

    asB = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    expect((await asB.auth.signInWithPassword({ email: b.email!, password })).error).toBeNull();
  });
  afterAll(async () => { for (const id of users) await admin.auth.admin.deleteUser(id); });

  it("traite la source en arrière-plan et la passe en ready avec chunks indexés", async () => {
    expect((await admin.from("sources").select("status").eq("id", src).single()).data!.status).toBe("pending");
    await admin.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(admin, "w-ingest", { ingest_source: ingestHandler(admin, null) });
    const s = (await admin.from("sources").select("status, language, word_count").eq("id", src).single()).data!;
    expect(s).toMatchObject({ status: "ready", language: "fr" });
    const { count } = await admin.from("chunks").select("id", { count: "exact", head: true }).eq("source_id", src);
    expect(count).toBeGreaterThan(1);
    const hits = await admin.rpc("match_chunks", { p_notebook: nb, p_embedding: null, p_query: "reseau ethernet", p_fts_config: "french", p_source_ids: [src], p_k: 3 });
    expect(hits.error).toBeNull();
    expect((hits.data as { content: string }[])[0].content).toMatch(/Ethernet/);
  });

  it("B ne voit ni le notebook, ni la source, ni les chunks, ni le fichier de A", async () => {
    expect((await asB.from("notebooks").select("id").eq("id", nb)).data).toEqual([]);
    expect((await asB.from("sources").select("id").eq("id", src)).data).toEqual([]);
    expect((await asB.from("chunks").select("id").eq("source_id", src)).data).toEqual([]);
    expect((await asB.from("sources").update({ title: "x" }).eq("id", src)).error?.code).toBe("42501");
    const dl = await asB.storage.from("sources").download(path);
    expect(dl.data).toBeNull();
    const signed = await asB.storage.from("sources").createSignedUrl(path, 60);
    expect(signed.data).toBeNull();
  });

  it("traite un PPTX déposé dans Storage (page = n° de diapositive)", async () => {
    const xml = (t: string) => strToU8(`<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`);
    const pptx = zipSync({ "ppt/slides/slide1.xml": xml("Introduction"), "ppt/slides/slide2.xml": xml("Le patch DMX associe chaque projecteur à une adresse.") });
    const ws = (await admin.from("notebooks").select("workspace_id").eq("id", nb).single()).data!.workspace_id;
    const p = `${ws}/${nb}/${crypto.randomUUID()}/original.pptx`;
    expect((await admin.storage.from("sources").upload(p, new Blob([pptx], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }))).error).toBeNull();
    const id = (await admin.rpc("add_source", { p_notebook: nb, p_user: users[0], p_kind: "pptx", p_title: "deck.pptx", p_storage_path: p })).data as string;
    await admin.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(admin, "w-ingest", { ingest_source: ingestHandler(admin, null) });
    expect((await admin.from("sources").select("status, page_count").eq("id", id).single()).data).toEqual({ status: "ready", page_count: 2 });
    const hit = (await admin.from("chunks").select("page_start, content").eq("source_id", id).ilike("content", "%patch DMX%")).data!;
    expect(hit[0].page_start).toBe(1); // un seul chunk couvre les 2 diapositives : il démarre page 1
  });

  it("indexe une note (kind note, texte dans note_body) et la rend cherchable", async () => {
    const note = (await admin.rpc("add_source", { p_notebook: nb, p_user: users[0], p_kind: "note", p_title: "Ma note", p_note_body: { text: "Le protocole sACN transporte le DMX en multicast." } })).data as string;
    await admin.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(admin, "w-ingest", { ingest_source: ingestHandler(admin, null) });
    expect((await admin.from("sources").select("status").eq("id", note).single()).data!.status).toBe("ready");
    const hits = await admin.rpc("match_chunks", { p_notebook: nb, p_embedding: null, p_query: "multicast", p_fts_config: "french", p_source_ids: [note], p_k: 3 });
    expect((hits.data as unknown[]).length).toBe(1);
  });

  it("une erreur d'extraction donne un statut failed persistant et lisible", async () => {
    const a = users[0];
    const bad = (await admin.rpc("add_source", { p_notebook: nb, p_user: a, p_kind: "pdf", p_title: "faux.pdf", p_storage_path: path })).data as string;
    await admin.from("jobs").update({ max_attempts: 1 }).eq("target_id", bad);
    await admin.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(admin, "w-ingest", { ingest_source: ingestHandler(admin, null) });
    const s = (await admin.from("sources").select("status, error_code").eq("id", bad).single()).data!;
    expect(s).toEqual({ status: "failed", error_code: "unreadable_file" });
  });
});

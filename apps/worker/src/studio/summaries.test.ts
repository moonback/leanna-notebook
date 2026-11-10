import { readFileSync, existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOnce } from "../worker.ts";
import type { Llm } from "../ai/llm.ts";
import { ingestHandler } from "../ingest/handler.ts";
import { guideHandler, overviewHandler, toGuide, toOverview } from "./summaries.ts";

describe("validation des résumés", () => {
  it("guide : JSON entouré de texte accepté, thèmes par défaut", () => {
    expect(toGuide('Voici {"summary":"Le DMX."}')).toEqual({ summary: "Le DMX.", topics: [] });
  });
  it("résumé : au plus 3 questions ; JSON invalide = erreur réessayable", () => {
    expect(toOverview('{"overview":"x","questions":["a","b","c","d"]}').questions).toEqual(["a", "b", "c"]);
    expect(() => toOverview("pas de json")).toThrow("invalid_model_output");
  });
});

const envFile = new URL("../../.env", import.meta.url);
const env: Record<string, string> = existsSync(envFile)
  ? Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)))
  : {};

describe.skipIf(!env.SUPABASE_URL)("guide de source et résumé du notebook (intégration, modèle simulé)", () => {
  let db: SupabaseClient; let user: string; let nb: string; let src: string;
  beforeAll(async () => {
    db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    user = (await db.auth.admin.createUser({ email: `summ-${Date.now()}@test.local`, email_confirm: true })).data.user!.id;
    const ws = (await db.from("workspaces").select("id").eq("owner_id", user).single()).data!.id;
    nb = (await db.from("notebooks").insert({ workspace_id: ws, created_by: user, title: "résumés" }).select("id").single()).data!.id;
    src = (await db.rpc("add_source", { p_notebook: nb, p_user: user, p_kind: "note", p_title: "DMX", p_note_body: { text: "Le DMX pilote 512 canaux par univers. Art-Net le transporte sur Ethernet." } })).data as string;
  });
  afterAll(async () => { if (user) await db.auth.admin.deleteUser(user); });

  it("l'ingestion d'une note programme le résumé différé (pas de guide), sans quota", async () => {
    await db.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(db, "w-summ", { ingest_source: ingestHandler(db, null, { summaries: true }) });
    const { data: jobs } = await db.from("jobs").select("kind, status, usage_id, run_after").eq("notebook_id", nb).in("kind", ["source_guide", "notebook_overview"]);
    expect(jobs!.map((j) => j.kind)).toEqual(["notebook_overview"]);
    expect(jobs!.every((j) => j.usage_id === null)).toBe(true);
    expect(new Date(jobs!.find((j) => j.kind === "notebook_overview")!.run_after).getTime()).toBeGreaterThan(Date.now());
  });

  it("le guide et le résumé sont enregistrés", async () => {
    const llm: Llm = async (messages) => messages[0].content.includes("thèmes clés")
      ? { text: '{"summary":"Le DMX et Art-Net.","topics":["DMX","Art-Net"]}', model: "test/model", usage: null }
      : { text: '{"overview":"Sources sur le DMX.","questions":["Combien de canaux ?","Quel transport ?","Quel réseau ?"]}', model: "test/model", usage: null };
    await db.from("jobs").update({ run_after: new Date().toISOString() }).eq("notebook_id", nb).eq("kind", "notebook_overview");
    const ws = (await db.from("notebooks").select("workspace_id").eq("id", nb).single()).data!.workspace_id;
    await db.from("jobs").insert({ workspace_id: ws, notebook_id: nb, kind: "source_guide", target_id: src });
    const handlers = { source_guide: guideHandler(db, llm), notebook_overview: overviewHandler(db, llm) };
    await db.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(db, "w-summ", handlers);
    await db.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(db, "w-summ", handlers);
    const s = (await db.from("sources").select("guide").eq("id", src).single()).data!;
    expect(s.guide).toMatchObject({ summary: "Le DMX et Art-Net.", topics: ["DMX", "Art-Net"] });
    const n = (await db.from("notebooks").select("overview, suggested_questions").eq("id", nb).single()).data!;
    expect(n).toEqual({ overview: "Sources sur le DMX.", suggested_questions: ["Combien de canaux ?", "Quel transport ?", "Quel réseau ?"] });
  });
});

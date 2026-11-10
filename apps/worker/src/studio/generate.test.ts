import { readFileSync, existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Passage } from "@notebook/core/citations";
import { runOnce } from "../worker.ts";
import type { Llm } from "../ai/llm.ts";
import { buildPrompt, parseJson, studioHandler, toContent } from "./generate.ts";

const P: Passage[] = [
  { n: 1, chunk_id: "c1", source_id: "s1", source_title: "Guide", content: "Le DMX pilote 512 canaux par univers.", char_start: 0, char_end: 37, page_start: null },
  { n: 2, chunk_id: "c2", source_id: "s1", source_title: "Guide", content: "Art-Net transporte le DMX sur Ethernet.", char_start: 38, char_end: 77, page_start: null },
];

describe("toContent (validation des sorties du modèle)", () => {
  it("rapport : citations résolues, numéros inventés supprimés", () => {
    const r = toContent("report", "## Synthèse\nUn univers compte 512 canaux [1]. Faux [9].", P);
    expect((r.content as { markdown: string }).markdown).toContain("512 canaux [1]");
    expect((r.content as { markdown: string }).markdown).not.toContain("[9]");
    expect(r.citations[0].chunk_id).toBe("c1");
  });
  it("fiches : JSON entouré de texte accepté, références filtrées", () => {
    const r = toContent("flashcards", 'Voici :\n```json\n{"cards":[{"front":"Canaux par univers ?","back":"512","n":[1,7]}]}\n```', P);
    expect((r.content as { cards: { refs: { n: number }[] }[] }).cards[0].refs.map((x) => x.n)).toEqual([1]);
  });
  it("quiz : refuse une bonne réponse hors des choix", () => {
    expect(() => toContent("quiz", '{"questions":[{"question":"?","choices":["a","b"],"answer":3}]}', P)).toThrow("invalid_model_output");
  });
  it("carte mentale : profondeur limitée à 3 niveaux", () => {
    const deep = { root: { label: "A", children: [{ label: "B", children: [{ label: "C", children: [{ label: "D", children: [{ label: "E" }] }] }] }] } };
    const r = toContent("mind_map", JSON.stringify(deep), P) as { content: { root: { children: { children: { children: { children: unknown[] }[] }[] }[] } } };
    expect(r.content.root.children[0].children[0].children[0].children).toEqual([]);
  });
  it("infographie : applique langue, orientation, style et niveau de détail au prompt", () => {
    const { messages, json } = buildPrompt("infographic", { orientation: "portrait", visualStyle: "scientific", detailLevel: "very_detailed" }, null, "<passage n=\"1\">x</passage>", "fr");
    expect(json).toBe(false);
    expect(messages[0].content).toContain("portrait vertical");
    expect(messages[0].content).toContain("visualisation scientifique rigoureuse");
    expect(messages[0].content).toContain("très détaillé");
  });
  it("JSON absent : erreur réessayable (pas PermanentError)", () => {
    expect(() => parseJson("pas de json")).toThrow("json_absent");
  });
  it("le prompt contient les passages et les règles d'ancrage", () => {
    const { messages, json } = buildPrompt("quiz", { difficulty: "hard" }, "public débutant", "<passage n=\"1\">x</passage>", "fr");
    expect(json).toBe(true);
    expect(messages[0].content).toMatch(/UNIQUEMENT à partir des passages/);
    expect(messages[0].content).toContain("public débutant");
    expect(messages[1].content).toContain('<passage n="1">');
  });
});

const envFile = new URL("../../.env", import.meta.url);
const env: Record<string, string> = existsSync(envFile)
  ? Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)))
  : {};

describe.skipIf(!env.SUPABASE_URL)("studioHandler (intégration, modèle simulé injecté)", () => {
  let db: SupabaseClient; let user: string; let nb: string;
  beforeAll(async () => {
    db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    user = (await db.auth.admin.createUser({ email: `studio-${Date.now()}@test.local`, email_confirm: true })).data.user!.id;
    const ws = (await db.from("workspaces").select("id").eq("owner_id", user).single()).data!.id;
    nb = (await db.from("notebooks").insert({ workspace_id: ws, created_by: user, title: "studio" }).select("id").single()).data!.id;
    const src = (await db.rpc("add_source", { p_notebook: nb, p_user: user, p_kind: "note", p_title: "n", p_note_body: { text: "x" } })).data as string;
    await db.rpc("replace_chunks", { p_source: src, p_chunks: [{ ordinal: 0, content: "Le DMX pilote 512 canaux.", char_start: 0, char_end: 25, token_count: 6 }], p_extracted_text: "Le DMX pilote 512 canaux.", p_language: "fr", p_fts_config: "french", p_word_count: 5 });
  });
  afterAll(async () => { if (user) await db.auth.admin.deleteUser(user); });

  it("rapport généré : artefact ready, titre tiré du Markdown, citation stockée, quota confirmé", async () => {
    const llm: Llm = async () => ({ text: "## Les univers DMX\nUn univers compte 512 canaux [1].", model: "test/model", usage: null });
    const art = (await db.rpc("create_artifact", { p_notebook: nb, p_user: user, p_type: "report", p_options: { template: "briefing" }, p_custom_prompt: null, p_source_ids: [] })).data as string;
    await db.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(db, "w-studio", { generate_artifact: studioHandler(db, llm) });
    const a = (await db.from("artifacts").select("status, title, content").eq("id", art).single()).data!;
    expect(a).toMatchObject({ status: "ready", title: "Les univers DMX" });
    expect((await db.from("citations").select("id").eq("artifact_id", art)).data).toHaveLength(1);
    const job = (await db.from("jobs").select("usage_id").eq("target_id", art).single()).data!;
    expect((await db.from("usage_ledger").select("status").eq("id", job.usage_id).single()).data!.status).toBe("committed");
  });

  it("sans clé : artefact failed (ai_not_configured) et crédit rendu", async () => {
    const art = (await db.rpc("create_artifact", { p_notebook: nb, p_user: user, p_type: "quiz", p_options: {}, p_custom_prompt: null, p_source_ids: [] })).data as string;
    await db.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(db, "w-studio", { generate_artifact: studioHandler(db, null) });
    expect((await db.from("artifacts").select("status, error_code").eq("id", art).single()).data).toEqual({ status: "failed", error_code: "ai_not_configured" });
    const job = (await db.from("jobs").select("usage_id").eq("target_id", art).single()).data!;
    expect((await db.from("usage_ledger").select("status").eq("id", job.usage_id).single()).data!.status).toBe("refunded");
  });
});

describe("modèles de rapport du Studio", () => {
  it("sélectionne un modèle de spécification sans perdre les règles de citations", () => {
    const { messages, json } = buildPrompt("report", { template: "specification", reportFormat: "document" }, null, "<passage n=\"1\">Exigence A</passage>", "fr");
    expect(json).toBe(false);
    expect(messages[0].content).toContain("critères d’acceptation");
    expect(messages[0].content).toContain("document final soigné");
    expect(messages[0].content).toContain("numéro entre crochets");
    expect(messages[1].content).toContain("Exigence A");
  });

  it("active les consignes de rapport interactif dans le Studio", () => {
    const { messages } = buildPrompt("report", { template: "action_plan", reportFormat: "interactive" }, null, "sources", "fr");
    expect(messages[0].content).toContain("rapport interactif");
    expect(messages[0].content).toContain("Plan d’action");
    expect(messages[0].content).toContain("N’utilise pas de HTML");
  });

  it("accepte les modèles IA supplémentaires et conserve le modèle par défaut", () => {
    expect(buildPrompt("report", { template: "blog_post" }, null, "sources", "fr").messages[0].content).toContain("Article de blog");
    expect(buildPrompt("report", { template: "custom" }, "Ajouter un glossaire", "sources", "fr").messages[0].content).toContain("Ajouter un glossaire");
    expect(buildPrompt("report", {}, null, "sources", "fr").messages[0].content).toContain("Note de synthèse");
  });
});


describe("nouveaux formats du Studio", () => {
  const formats = ["infographic", "timeline", "comparison", "glossary", "faq", "diagram", "editorial", "study_plan"];
  it.each(formats)("génère %s en Markdown sourcé et conserve les citations", (type) => {
    const prompt = buildPrompt(type, {}, null, "<passage n=\"1\">Le DMX pilote 512 canaux.</passage>", "fr");
    expect(prompt.json).toBe(false);
    expect(prompt.messages[0].content).toContain("UNIQUEMENT à partir des passages");
    const generated = toContent(type, "## Synthèse\nLe DMX pilote 512 canaux [1].", P);
    expect((generated.content as { markdown: string }).markdown).toContain("512 canaux [1]");
    expect(generated.citations[0].chunk_id).toBe("c1");
  });
});

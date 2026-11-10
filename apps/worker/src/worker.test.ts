// Test d'intégration contre Supabase local (supabase start). Ignoré si .env est absent.
import { readFileSync, existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PermanentError, runOnce } from "./worker.ts";

const envFile = new URL("../.env", import.meta.url);
const env: Record<string, string> = existsSync(envFile)
  ? Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
  : {};

describe.skipIf(!env.SUPABASE_URL)("worker (intégration)", () => {
  let db: SupabaseClient;
  let userId: string, ws: string, nb: string;

  beforeAll(async () => {
    db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await db.auth.admin.createUser({ email: `worker-${Date.now()}@test.local`, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    ws = (await db.from("workspaces").select("id").eq("owner_id", userId).single()).data!.id;
    nb = (await db.from("notebooks").insert({ workspace_id: ws, created_by: userId, title: "test worker" }).select("id").single()).data!.id;
  });
  afterAll(async () => { if (userId) await db.auth.admin.deleteUser(userId); });

  it("ne réclame rien sans handler", async () => {
    expect(await runOnce(db, "w-test", {})).toBeNull();
  });

  it("exécute un job, publie la progression et le passe en succeeded", async () => {
    const id = (await db.from("jobs").insert({ workspace_id: ws, notebook_id: nb, kind: "export_account" }).select("id").single()).data!.id;
    const seen: number[] = [];
    await db.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(db, "w-test", {
      export_account: async (_, ctx) => { await ctx.progress(50, "étape 1"); seen.push(50); return { ok: true }; },
    });
    const row = (await db.from("jobs").select("status, progress, result").eq("id", id).single()).data!;
    expect(seen).toEqual([50]);
    expect(row).toMatchObject({ status: "succeeded", progress: 100, result: { ok: true } });
  });

  it("échec définitif : statut failed et quota remboursé", async () => {
    const art = (await db.rpc("create_artifact", { p_notebook: nb, p_user: userId, p_type: "report", p_options: {}, p_custom_prompt: null, p_source_ids: [] })).data as string;
    const j = (await db.from("jobs").select("id, usage_id").eq("target_id", art).single()).data!;
    await db.from("jobs").update({ priority: 0 }).eq("notebook_id", nb).eq("status", "queued"); // passer avant les jobs réels de la base de dev
    await runOnce(db, "w-test", { generate_artifact: async () => { throw new PermanentError("source_unreadable"); } });
    const row = (await db.from("jobs").select("status, error_code").eq("id", j.id).single()).data!;
    const usage = (await db.from("usage_ledger").select("status").eq("id", j.usage_id).single()).data!;
    expect(row).toEqual({ status: "failed", error_code: "source_unreadable" });
    expect(usage.status).toBe("refunded");
  });

  it("worker mort : requeue_stale_jobs remet en file, ou échoue et rembourse au dernier essai", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const art = (await db.rpc("create_artifact", { p_notebook: nb, p_user: userId, p_type: "quiz", p_options: {}, p_custom_prompt: null, p_source_ids: [] })).data as string;
    const j = (await db.from("jobs").select("id, usage_id").eq("target_id", art).single()).data!;
    const retry = (await db.from("jobs").insert({ workspace_id: ws, notebook_id: nb, kind: "export_account", status: "running", attempts: 1, locked_by: "mort", locked_until: past }).select("id").single()).data!.id;
    await db.from("jobs").update({ status: "running", attempts: 3, max_attempts: 3, locked_by: "mort", locked_until: past }).eq("id", j.id);
    expect(await db.rpc("requeue_stale_jobs")).toMatchObject({ error: null });
    expect((await db.from("jobs").select("status, locked_by").eq("id", retry).single()).data).toEqual({ status: "queued", locked_by: null });
    expect((await db.from("jobs").select("status, error_code").eq("id", j.id).single()).data).toEqual({ status: "failed", error_code: "lease_expired" });
    expect((await db.from("artifacts").select("status").eq("id", art).single()).data!.status).toBe("failed");
    expect((await db.from("usage_ledger").select("status").eq("id", j.usage_id).single()).data!.status).toBe("refunded");
  });
});

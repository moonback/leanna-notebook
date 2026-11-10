import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, requireUser } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";
import { SYSTEM_PROMPT_CATALOG } from "@/lib/ai/prompt-catalog";

export const runtime = "nodejs";
const bodySchema = z.object({ key: z.string().min(1).max(80), content: z.string().max(12000) }).strict();
const allowed = new Set<string>(SYSTEM_PROMPT_CATALOG.map((p) => p.key));

export const GET = handle(async () => {
  const user = await requireUser();
  const { data, error } = await createServiceClient().from("ai_prompt_overrides")
    .select("prompt_key, content, updated_at").eq("user_id", user.id);
  if (error) throw error;
  return NextResponse.json({ catalog: SYSTEM_PROMPT_CATALOG.map(({ key, label, group, description, defaultPrompt }) => ({ key, label, group, description, defaultPrompt })), overrides: Object.fromEntries((data ?? []).map((row) => [row.prompt_key, row.content])), updatedAt: Object.fromEntries((data ?? []).map((row) => [row.prompt_key, row.updated_at])) });
});

export const PUT = handle(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !allowed.has(parsed.data.key)) throw new ApiError(400, "invalid_prompt");
  const content = parsed.data.content.trim();
  const db = createServiceClient();
  if (!content) {
    const { error } = await db.from("ai_prompt_overrides").delete().eq("user_id", user.id).eq("prompt_key", parsed.data.key);
    if (error) throw error;
    return NextResponse.json({ ok: true, reset: true });
  }
  const { error } = await db.from("ai_prompt_overrides").upsert({ user_id: user.id, prompt_key: parsed.data.key, content, updated_at: new Date().toISOString() }, { onConflict: "user_id,prompt_key" });
  if (error) throw error;
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: NextRequest) => {
  const user = await requireUser();
  const key = new URL(req.url).searchParams.get("key");
  if (!key || !allowed.has(key)) throw new ApiError(400, "invalid_prompt");
  const { error } = await createServiceClient().from("ai_prompt_overrides").delete().eq("user_id", user.id).eq("prompt_key", key);
  if (error) throw error;
  return NextResponse.json({ ok: true, reset: true });
});

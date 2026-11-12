import { NextResponse, type NextRequest } from "next/server";
import { handle, requireRole, requireUser } from "@/lib/api";
import { createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/** Recherche paginée d'entités (nom, type) — index trigramme sur le nom. */
export const GET = handle(async (req: NextRequest, { params }: Params) => {
  await requireUser();
  const { id } = await params;
  await requireRole(id, "viewer");
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100).replace(/[%_\\]/g, (c) => `\\${c}`);
  const type = sp.get("type");
  const page = Math.max(0, Number(sp.get("page")) || 0);
  const size = Math.min(100, Math.max(5, Number(sp.get("pageSize")) || 30));
  const supabase = await createUserClient();
  let query = supabase.from("knowledge_entities").select("id, name, type, description, confidence, mention_count, source_count", { count: "exact" })
    .eq("notebook_id", id).order("source_count", { ascending: false }).order("mention_count", { ascending: false }).order("name")
    .range(page * size, page * size + size - 1);
  if (q) query = query.ilike("name", `%${q}%`);
  if (type && /^[a-z_]{2,30}$/.test(type)) query = query.eq("type", type);
  const { data, count, error } = await query;
  if (error) throw error;
  return NextResponse.json({ entities: data ?? [], total: count ?? 0, page, pageSize: size });
});

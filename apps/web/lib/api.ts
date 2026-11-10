import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { z } from "zod";
import { createUserClient, getUser } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation";
import { log } from "@/lib/log";

export type Role = "chat" | "viewer" | "editor" | "owner";
const RANK: Record<Role, number> = { chat: 0, viewer: 1, editor: 2, owner: 3 };

/** Erreur métier convertie en réponse JSON par `handle`. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly extra?: object) { super(code); }
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) throw new ApiError(401, "auth_required");
  return user;
}

/**
 * Contrôle d'autorisation UNIQUE des écritures : rôle calculé en base (my_notebook_role, JWT de l'utilisateur).
 * Un notebook invisible renvoie 404 (on ne révèle pas son existence).
 */
export async function requireRole(notebookId: string, min: Role): Promise<Role> {
  if (!/^[0-9a-f-]{36}$/i.test(notebookId)) throw new ApiError(404, "not_found");
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("my_notebook_role", { p_nb: notebookId });
  if (error) throw error;
  const role = data as Role | null;
  if (!role) throw new ApiError(404, "not_found");
  if (RANK[role] < RANK[min]) throw new ApiError(403, "forbidden");
  return role;
}

/** Derrière un proxy (Railway), `nextUrl.origin` peut être l'adresse interne : on compare aussi à l'hôte public transmis. */
function sameOrigin(req: NextRequest, origin: string): boolean {
  if (origin === req.nextUrl.origin) return true;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]?.trim();
  if (!host) return false;
  const proto = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim();
  return origin === `${proto}://${host}`;
}

export async function parseBody<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  const origin = req.headers.get("origin");
  if (origin && !sameOrigin(req, origin)) throw new ApiError(403, "forbidden");
  let body: unknown;
  try { body = await req.json(); } catch { throw new ApiError(400, "invalid_json"); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(422, "validation", { fields: fieldErrors(parsed.error) });
  return parsed.data;
}

/** Erreurs Postgres levées par nos fonctions SQL → codes API lisibles. */
function fromPostgres(e: { code?: string; message?: string }): ApiError | null {
  const m = e.message ?? "";
  if (m.includes("quota_daily_exceeded")) return new ApiError(429, "quota_daily_exceeded");
  if (m.includes("quota_monthly_exceeded")) return new ApiError(429, "quota_monthly_exceeded");
  if (m.includes("max_sources")) return new ApiError(409, "max_sources");
  if (m.includes("notebook_not_found")) return new ApiError(404, "not_found");
  return null;
}

/** Enveloppe de route : erreurs typées → JSON, inattendues → 500 journalisée sans données utilisateur. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      const err = e instanceof ApiError ? e : fromPostgres(e as { message?: string });
      if (err) return NextResponse.json({ error: err.code, ...err.extra }, { status: err.status });
      log.error("api_unhandled", { error: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  };
}

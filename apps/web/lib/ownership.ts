import "server-only";
import { ApiError, requireRole, type Role } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/research";

type Owned = "research_runs" | "knowledge_entities" | "knowledge_relations" | "knowledge_contradictions";

/**
 * Autorisation d'une ressource désignée par son id : on retrouve son notebook côté serveur
 * puis on applique le contrôle de rôle unique (my_notebook_role). Invisible = 404.
 */
export async function requireRoleFor(table: Owned, id: string, min: Role): Promise<{ notebookId: string; role: Role }> {
  if (!UUID.test(id)) throw new ApiError(404, "not_found");
  const { data } = await createServiceClient().from(table).select("notebook_id").eq("id", id).maybeSingle();
  if (!data?.notebook_id) throw new ApiError(404, "not_found");
  const role = await requireRole(data.notebook_id as string, min);
  return { notebookId: data.notebook_id as string, role };
}

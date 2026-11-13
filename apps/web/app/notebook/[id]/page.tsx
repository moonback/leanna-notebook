import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { canUseBrowser } from "@/lib/browser/access";
import { createUserClient, getUser } from "@/lib/supabase/server";
import { Workspace, type Role } from "./workspace";

export const metadata: Metadata = { title: "Notebook" };

/** S08 — Espace de travail d'un notebook (Sources | Chat | Studio). */
export default async function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?next=/notebook/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createUserClient();
  const [{ data: role }, { data: nb }, { data: profile }, browserEnabled] = await Promise.all([
    supabase.rpc("my_notebook_role", { p_nb: id }),
    supabase.from("notebooks").select("id, title, emoji, allow_copies").eq("id", id).maybeSingle(),
    supabase.from("profiles").select("disabled_features").eq("id", user.id).maybeSingle(),
    canUseBrowser(user.id),
  ]);
  if (!role || !nb) notFound(); // invisible = inexistant (on ne révèle rien)

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader notebookId={id} />
      <Workspace notebookId={id} initialTitle={nb.title} role={role as Role} allowCopies={nb.allow_copies} disabledFeatures={(profile?.disabled_features as string[] | null) ?? []} browserEnabled={browserEnabled} />
    </div>
  );
}

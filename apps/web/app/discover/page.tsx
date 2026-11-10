import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createUserClient, getUser } from "@/lib/supabase/server";
import { Discover, type FeaturedNotebook } from "./discover";

export const metadata: Metadata = { title: "Découvrir · Notebook" };

/** S04 : galerie éditoriale. Seuls les notebooks explicitement marqués featured sont listés. */
export default async function DiscoverPage() {
  if (!(await getUser())) redirect("/login?next=/discover");
  const db = await createUserClient();
  const { data, error } = await db.from("notebooks")
    .select("id, title, emoji, overview, allow_copies, created_at")
    .eq("is_featured", true)
    .order("created_at", { ascending: false })
    .limit(60);
  const items: FeaturedNotebook[] = (data ?? []).map((n) => ({
    id: n.id, title: n.title, emoji: n.emoji, overview: n.overview,
    allowCopies: n.allow_copies, createdAt: n.created_at,
  }));
  return <div className="min-h-dvh"><Discover initial={items} loadError={Boolean(error)} /></div>;
}

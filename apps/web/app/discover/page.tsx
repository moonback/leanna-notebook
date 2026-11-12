import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServiceClient, createUserClient, getUser } from "@/lib/supabase/server";
import { Discover, type FeaturedNotebook } from "./discover";

export const metadata: Metadata = { title: "Découvrir · Notebook" };
export const dynamic = "force-dynamic";

/** S04 : galerie. Notebooks éditoriaux (featured) + notebooks publiés publiquement par leurs propriétaires. */
export default async function DiscoverPage() {
  if (!(await getUser())) redirect("/login?next=/discover");
  const db = await createUserClient();
  const [featured, published] = await Promise.all([
    db.from("notebooks")
      .select("id, title, emoji, overview, allow_copies, created_at")
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(60),
    // Lecture serveur, colonnes explicites : seuls les notebooks publiés (public_slug non nul).
    createServiceClient().from("notebooks")
      .select("id, title, emoji, overview, allow_copies, public_slug, published_at")
      .not("public_slug", "is", null)
      .order("published_at", { ascending: false })
      .limit(60),
  ]);
  const items: FeaturedNotebook[] = (featured.data ?? []).map((n) => ({
    id: n.id, title: n.title, emoji: n.emoji, overview: n.overview,
    allowCopies: n.allow_copies, createdAt: n.created_at, publicSlug: null,
  }));
  const seen = new Set(items.map((i) => i.id));
  for (const n of published.data ?? []) {
    if (seen.has(n.id)) continue;
    items.push({
      id: n.id, title: n.title, emoji: n.emoji, overview: n.overview,
      allowCopies: n.allow_copies, createdAt: n.published_at ?? new Date().toISOString(), publicSlug: n.public_slug,
    });
  }
  return <div className="min-h-dvh"><Discover initial={items} loadError={Boolean(featured.error || published.error)} /></div>;
}

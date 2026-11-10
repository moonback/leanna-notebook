import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surfaces";
import { createUserClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lien de partage · Notebook", robots: { index: false } };

/** Ouverture d'un lien de partage : enregistre la visite (rôle lecteur ou chat seul) puis ouvre le notebook. */
export default async function ShareLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await getUser())) redirect(`/login?next=${encodeURIComponent(`/s/${token}`)}`);
  const ok = /^[A-Za-z0-9_-]{20,64}$/.test(token);
  const { data: notebookId } = ok ? await (await createUserClient()).rpc("accept_share_link", { p_token: token }) : { data: null };
  if (notebookId) redirect(`/notebook/${notebookId}`);

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto grid max-w-lg px-4 py-16">
        <Card className="grid gap-4 p-6 text-center">
          <h1 className="text-xl">Ce lien n’est plus valide</h1>
          <p className="text-sm text-text-muted">Il a peut-être été révoqué par son propriétaire, ou l’adresse est incomplète. Demandez-lui un nouveau lien.</p>
          <Button asChild className="justify-self-center"><Link href="/">Retour à mes notebooks</Link></Button>
        </Card>
      </main>
    </div>
  );
}

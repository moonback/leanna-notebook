"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

const ERRORS: Record<string, string> = {
  max_notebooks: "Vous avez atteint le nombre maximal de notebooks de votre offre.",
  max_sources: "Cette copie dépasse le nombre de sources autorisé par votre offre.",
  copies_disabled: "Le propriétaire n’autorise pas les copies.",
};

/** H05 : duplique le notebook (sources, passages, guides, contenus générés) dans votre espace. */
export function useCopyNotebook(notebookId: string) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function copy() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/notebooks/${notebookId}/copy`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return toast({ title: "Copie impossible", description: ERRORS[json.error] ?? "Réessayez dans un instant.", tone: "error" });
      toast({ title: "Notebook copié", description: "Les conversations et notes ne sont pas reprises.", tone: "success" });
      router.push(`/notebook/${json.notebook.id}`);
    } catch {
      toast({ title: "Copie impossible", description: "Vérifiez votre connexion puis réessayez.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return { busy, copy };
}

export function CopyButton({ notebookId }: { notebookId: string }) {
  const { busy, copy } = useCopyNotebook(notebookId);
  return <Button size="sm" variant="secondary" loading={busy} onClick={() => void copy()}><Copy aria-hidden /> Faire une copie</Button>;
}

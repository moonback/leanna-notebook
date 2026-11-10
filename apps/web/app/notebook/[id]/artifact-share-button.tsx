"use client";
import * as React from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";

/** Création à la demande : l'URL n'est montrée qu'une fois et le jeton n'est jamais stocké en clair. */
export function ArtifactShareButton({ artifactId, disabled = false }: { artifactId: string; disabled?: boolean }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [linkId, setLinkId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function createLink() {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/artifacts/${artifactId}/share`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.link?.url !== "string") {
        toast({ title: "Lien public non créé", description: body.error === "forbidden" ? "Droits insuffisants." : "Réessayez dans un instant.", tone: "error" });
        return;
      }
      setUrl(body.link.url);
      setLinkId(body.link.id);
      try {
        await navigator.clipboard.writeText(body.link.url);
        toast({ title: "Lien créé et copié", tone: "success" });
      } catch {
        toast({ title: "Lien créé", description: "Copiez l’adresse affichée ci-dessous." });
      }
    } catch {
      toast({ title: "Lien public non créé", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" disabled={disabled || loading} loading={loading} onClick={() => void createLink()}>
          <Share2 aria-hidden /> Partager ce contenu
        </Button>
      </div>
      {url && (
        <Field id={`artifact-share-${artifactId}`} label="Lien public · toute personne disposant du lien peut consulter">
          <div className="flex gap-2">
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button size="icon-sm" variant="secondary" aria-label="Copier le lien" onClick={() => void navigator.clipboard.writeText(url)}>
              <Copy aria-hidden />
            </Button>
          </div>
        </Field>
      )}
    </div>
  );
}

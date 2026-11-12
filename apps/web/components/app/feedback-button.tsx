"use client";
import * as React from "react";
import { MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";

const CATEGORIES = {
  feedback: [["bug", "Quelque chose ne fonctionne pas"], ["idea", "Une idée d’amélioration"], ["other", "Autre"]],
  abuse: [["spam", "Spam ou contenu trompeur"], ["illegal", "Contenu illégal"], ["harassment", "Harcèlement ou haine"], ["copyright", "Atteinte au droit d’auteur"], ["other", "Autre"]],
} as const;

/** J04 : envoyer un avis ; sur un notebook, le signaler. */
export function FeedbackButton({ notebookId, open: openProp, onOpenChange }: { notebookId?: string; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = React.useState(false);
  const open = controlled ? openProp : openState;
  const setOpen = (v: boolean) => { if (!controlled) setOpenState(v); onOpenChange?.(v); };
  const [kind, setKind] = React.useState<"feedback" | "abuse">("feedback");
  const [category, setCategory] = React.useState("bug");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [sending, setSending] = React.useState(false);

  function reset(k: "feedback" | "abuse") { setKind(k); setCategory(CATEGORIES[k][0][0]); setError(undefined); }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError(undefined);
    const r = await fetch("/api/v1/reports", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, category, body, ...(notebookId ? { notebookId } : {}) }) }).catch(() => null);
    setSending(false);
    if (r?.status === 422) { setError((await r.json()).fields?.body ?? "Vérifiez le formulaire."); return; }
    if (r?.status === 429) { setError("Vous avez envoyé beaucoup de messages aujourd’hui. Réessayez demain."); return; }
    if (!r?.ok) { setError("Envoi impossible. Réessayez."); return; }
    toast({ title: kind === "abuse" ? "Signalement envoyé" : "Merci pour votre avis", description: kind === "abuse" ? "Notre équipe va l’examiner." : undefined, tone: "success" });
    setOpen(false); setBody("");
  }

  return (
    <>
      {!controlled && <Button variant="ghost" size="icon" aria-label="Envoyer un avis ou signaler" onClick={() => { reset("feedback"); setOpen(true); }}><MessageSquareWarning aria-hidden /></Button>}
      <Dialog open={open} onOpenChange={(v) => { if (v && controlled) reset("feedback"); setOpen(v); }}>
        <DialogContent title={kind === "abuse" ? "Signaler ce notebook" : "Envoyer un avis"} description={kind === "abuse" ? "Le signalement est confidentiel : le propriétaire ne voit pas qui l’a envoyé." : "Votre message est lu par l’équipe produit."}>
          <form onSubmit={submit} className="grid gap-4">
            {notebookId && (
              <div role="radiogroup" aria-label="Type de message" className="grid grid-cols-2 gap-2">
                {(["feedback", "abuse"] as const).map((k) => (
                  <Button key={k} type="button" role="radio" aria-checked={kind === k} variant={kind === k ? "primary" : "secondary"} onClick={() => reset(k)}>
                    {k === "feedback" ? "Donner un avis" : "Signaler un abus"}
                  </Button>
                ))}
              </div>
            )}
            <Field id="report-category" label="Motif">
              <select className="h-10 w-full rounded-md border border-border-input bg-surface-raised px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES[kind].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field id="report-body" label={kind === "abuse" ? "Précisions (facultatif)" : "Votre message"} error={error}>
              <Textarea value={body} maxLength={5000} onChange={(e) => { setBody(e.target.value); setError(undefined); }} />
            </Field>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="secondary">Annuler</Button></DialogClose>
              <Button type="submit" loading={sending}>Envoyer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

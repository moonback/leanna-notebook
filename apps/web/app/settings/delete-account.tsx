"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";

/** Suppression définitive du compte : confirmation par saisie de l'e-mail, puis DELETE /api/v1/me. */
export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/v1/me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: value }),
      });
      if (res.status === 422) {
        const json = await res.json().catch(() => ({}));
        return setError(json.fields?.confirm ?? "Confirmation invalide.");
      }
      if (!res.ok) throw new Error();
      window.location.assign("/login");
    } catch {
      toast({ title: "Suppression impossible", description: "Réessayez dans un instant.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-text-muted">
        Supprime définitivement votre compte, vos notebooks, sources, conversations et contenus générés. Les notebooks que vous avez partagés disparaissent aussi pour leurs destinataires. Cette action est irréversible.
      </p>
      <div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setValue(""); setError(undefined); } }}>
          <DialogTrigger asChild><Button variant="danger">Supprimer mon compte</Button></DialogTrigger>
          <DialogContent title="Supprimer votre compte ?" description="Toutes vos données seront effacées sans possibilité de récupération." size="sm">
            <form onSubmit={onSubmit} className="grid gap-4" noValidate>
              <Field id="confirm_email" label={`Saisissez ${email} pour confirmer`} error={error}>
                <Input value={value} autoComplete="off" onChange={(e) => setValue(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2">
                <DialogClose asChild><Button type="button" variant="secondary">Annuler</Button></DialogClose>
                <Button type="submit" variant="danger" loading={busy} disabled={value.trim().toLowerCase() !== email.toLowerCase()}>
                  Supprimer définitivement
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

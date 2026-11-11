"use client";
import * as React from "react";
import { Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert, Badge, Skeleton } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { useConfirm } from "@/components/ui/confirm";
import { ListRow } from "@/components/ui/surfaces";
import { toast } from "@/components/ui/toast";

type Link = { id: string; scope: "full" | "chat_only"; created_at: string };
const SCOPES = { full: "Lecture et chat", chat_only: "Chat seul (sources masquées)" } as const;
type Person = { member_id: string | null; user_id: string | null; email: string; display_name: string | null; role: "owner" | "editor" | "viewer"; pending: boolean };
const ROLES = [["viewer", "Lecteur"], ["editor", "Éditeur"]] as const;
const select = "h-9 rounded-md border border-border-input bg-surface-raised px-2 text-sm";
const ERRORS: Record<string, string> = {
  already_member: "Cette personne a déjà accès.",
  already_owner: "C’est le propriétaire du notebook.",
  max_members: "Nombre maximal de personnes atteint pour votre offre.",
};

/** H01 : partage privé par email (propriétaire). Rôles appliqués côté serveur. */
export function ShareButton({ notebookId, allowCopies, open: controlledOpen, onOpenChange }: { notebookId: string; allowCopies: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const controlled = controlledOpen !== undefined;
  const [copies, setCopies] = React.useState(allowCopies);
  async function toggleCopies(v: boolean) {
    setCopies(v);
    const r = await fetch(`/api/v1/notebooks/${notebookId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ allow_copies: v }) }).catch(() => null);
    if (!r?.ok) { setCopies(!v); toast({ title: "Réglage non enregistré", tone: "error" }); }
  }
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = controlled ? controlledOpen : innerOpen;
  const setOpen = controlled ? (v: boolean) => onOpenChange?.(v) : setInnerOpen;
  const [confirm, confirmDialog] = useConfirm();
  const [people, setPeople] = React.useState<Person[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"viewer" | "editor">("viewer");
  const [error, setError] = React.useState<string>();
  const [sending, setSending] = React.useState(false);

  const [links, setLinks] = React.useState<Link[]>([]);
  const [created, setCreated] = React.useState<string | null>(null); // URL affichée une seule fois
  const load = React.useCallback(async () => {
    try {
      const [r, l] = await Promise.all([fetch(`/api/v1/notebooks/${notebookId}/members`), fetch(`/api/v1/notebooks/${notebookId}/links`)]);
      if (!r.ok || !l.ok) throw new Error();
      setPeople((await r.json()).people); setLinks((await l.json()).links); setFailed(false);
    } catch { setFailed(true); }
  }, [notebookId]);
  async function createLink(scope: Link["scope"]) {
    const r = await fetch(`/api/v1/notebooks/${notebookId}/links`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope }) }).catch(() => null);
    if (!r?.ok) { toast({ title: "Lien non créé", tone: "error" }); return; }
    const { link } = await r.json();
    setCreated(link.url); setLinks((xs) => [link, ...xs]);
    await navigator.clipboard?.writeText(link.url).then(() => toast({ title: "Lien copié", tone: "success" }), () => undefined);
  }
  async function revoke(l: Link) {
    if (!(await confirm({ title: "Révoquer ce lien ?", description: "Les personnes qui l’ont ouvert perdent aussitôt l’accès.", confirmLabel: "Révoquer" }))) return;
    const r = await fetch(`/api/v1/share-links/${l.id}`, { method: "DELETE" });
    if (r.ok) { setLinks((xs) => xs.filter((x) => x.id !== l.id)); setCreated(null); } else toast({ title: "Révocation impossible", tone: "error" });
  }
  React.useEffect(() => { if (open) void load(); }, [open, load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError(undefined);
    const r = await fetch(`/api/v1/notebooks/${notebookId}/members`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) }).catch(() => null);
    setSending(false);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) { setError(j?.fields?.email ?? ERRORS[j?.error] ?? "Invitation impossible. Réessayez."); return; }
    toast({ title: j.member.pending ? "Invitation enregistrée" : "Accès accordé", description: j.member.pending ? "Le notebook apparaîtra dès que cette personne créera son compte avec cette adresse." : "Le notebook apparaît dans « Partagés avec moi » pour cette personne.", tone: "success" });
    setEmail(""); void load();
  }
  async function changeRole(p: Person, next: string) {
    const r = await fetch(`/api/v1/notebook-members/${p.member_id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: next }) });
    if (r.ok) setPeople((xs) => xs?.map((x) => (x.member_id === p.member_id ? { ...x, role: next as Person["role"] } : x)) ?? null);
    else toast({ title: "Rôle non modifié", tone: "error" });
  }
  async function remove(p: Person) {
    if (!(await confirm({ title: `Retirer l’accès de ${p.email} ?`, description: "Cette personne ne pourra plus ouvrir ce notebook.", confirmLabel: "Retirer" }))) return;
    const r = await fetch(`/api/v1/notebook-members/${p.member_id}`, { method: "DELETE" });
    if (r.ok) setPeople((xs) => xs?.filter((x) => x.member_id !== p.member_id) ?? null);
    else toast({ title: "Retrait impossible", tone: "error" });
  }

  return (
    <>
      {confirmDialog}
      {!controlled && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Share2 aria-hidden /> Partager</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Partager le notebook" description="Les lecteurs consultent et posent des questions ; les éditeurs ajoutent des sources et génèrent du contenu.">
          <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field id="share-email" label="Adresse email" error={error}>
              <Input type="email" required value={email} maxLength={320} autoComplete="off" onChange={(e) => { setEmail(e.target.value); setError(undefined); }} placeholder="prenom@exemple.fr" />
            </Field>
            <select aria-label="Rôle" className={`${select} h-10`} value={role} onChange={(e) => setRole(e.target.value as "viewer" | "editor")}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <Button type="submit" loading={sending}>Inviter</Button>
          </form>
          <p className="mt-2 text-xs text-text-subtle">Aucun email n’est envoyé pour l’instant : prévenez la personne vous-même.</p>
          <h3 className="mb-1 mt-5 text-sm font-medium text-text-muted">Personnes ayant accès</h3>
          {failed ? <Alert tone="danger" title="Liste indisponible" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Réessayer</Button>} />
            : !people ? <div className="grid gap-2" aria-busy="true" aria-label="Chargement"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            : (
              <ul className="grid max-h-72 gap-0.5 overflow-y-auto">
                {people.map((p) => (
                  <li key={p.member_id ?? "owner"}>
                    <ListRow
                      title={p.display_name || p.email}
                      meta={p.display_name ? p.email : undefined}
                      trailing={p.role === "owner" ? <Badge>Propriétaire</Badge> : (
                        <span className="flex items-center gap-1">
                          {p.pending && <Badge tone="warning">En attente d’inscription</Badge>}
                          <select aria-label={`Rôle de ${p.email}`} className={select} value={p.role} onChange={(e) => void changeRole(p, e.target.value)}>
                            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <Button size="icon-sm" variant="ghost" aria-label={`Retirer ${p.email}`} onClick={() => void remove(p)}><Trash2 aria-hidden /></Button>
                        </span>
                      )}
                    />
                  </li>
                ))}
              </ul>
            )}
          <h3 className="mb-1 mt-5 text-sm font-medium text-text-muted">Lien de partage</h3>
          <p className="mb-2 text-xs text-text-subtle">Toute personne connectée qui ouvre le lien obtient l’accès choisi. « Chat seul » permet de poser des questions sans voir les sources.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void createLink("full")}>Créer un lien « {SCOPES.full} »</Button>
            <Button size="sm" variant="secondary" onClick={() => void createLink("chat_only")}>Créer un lien « Chat seul »</Button>
          </div>
          {created && (
            <div className="mt-3 grid gap-1">
              <Field id="share-link" label="Nouveau lien (affiché une seule fois)">
                <Input readOnly value={created} onFocus={(e) => e.currentTarget.select()} />
              </Field>
            </div>
          )}
          <label className="mt-5 flex items-center gap-3 text-sm">
            <Switch checked={copies} onCheckedChange={(v) => void toggleCopies(v)} />
            Autoriser les lecteurs à faire une copie (sources et contenus générés, sans vos conversations ni notes)
          </label>
          {links.length > 0 && (
            <ul className="mt-3 grid gap-0.5">
              {links.map((l) => (
                <li key={l.id}>
                  <ListRow title={SCOPES[l.scope]} meta={`Créé le ${new Date(l.created_at).toLocaleDateString("fr-FR")}`}
                    trailing={<Button size="sm" variant="ghost" onClick={() => void revoke(l)}>Révoquer</Button>} />
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

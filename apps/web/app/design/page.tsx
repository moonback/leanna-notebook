"use client";
// Page de contrôle du design system (/design) : chaque primitive, chaque état, clair/sombre.
import * as React from "react";
import {
  FileText, Globe, Mic, Plus, MoreVertical, Pencil, Trash2, Share2, Sparkles, BookOpen,
  Network, Layers, ListChecks, FileAudio, Moon, Sun, Inbox, ArrowUp, SlidersHorizontal, LayoutGrid, List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field, SearchInput } from "@/components/ui/field";
import { Dialog, DialogTrigger, DialogContent, DialogClose, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, Tooltip } from "@/components/ui/overlay";
import { Checkbox, Switch, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/controls";
import { Badge, Skeleton, Progress, EmptyState, Alert } from "@/components/ui/feedback";
import { Card, Panel, Table, Th, Td, Tr, ListRow } from "@/components/ui/surfaces";
import { Citation } from "@/components/ui/citation";
import { toast } from "@/components/ui/toast";
import tokens from "./tokens.json";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t py-10">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">{title}</h2>
      {children}
    </section>
  );
}

const studioTools = [
  ["Résumé audio", FileAudio], ["Carte mentale", Network], ["Fiches", Layers],
  ["Quiz", ListChecks], ["Rapport", BookOpen], ["Présentation", Sparkles],
] as const;

export default function DesignPage() {
  const [dark, setDark] = React.useState(false);
  const [sourcesOpen, setSourcesOpen] = React.useState(true);
  React.useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);

  return (
    <main className="mx-auto max-w-[var(--page-max-w)] px-4 pb-24 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 py-10">
        <div>
          <p className="text-sm text-text-muted">Design system · v0.1</p>
          <h1 className="font-serif text-display">Papier &amp; encre</h1>
          <p className="mt-2 max-w-xl text-text-muted">Une interface calme pour lire, interroger et vérifier ses sources. Chaque couleur est un rôle ; chaque paire de texte passe WCAG AA.</p>
        </div>
        <Button variant="secondary" onClick={() => setDark((d) => !d)}>
          {dark ? <Sun aria-hidden /> : <Moon aria-hidden />} Thème {dark ? "clair" : "sombre"}
        </Button>
      </header>

      <Section title="Couleurs (rôles)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Object.keys(tokens.color).map((k) => (
            <div key={k} className="overflow-hidden rounded-lg border">
              <div className="h-14" style={{ background: `var(--${k})` }} />
              <p className="px-2.5 py-2 font-mono text-xs">{k}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typographie">
        <div className="grid gap-3">
          <p className="font-serif text-display">Comprendre ses sources</p>
          <p className="text-2xl">Titre de page — 28/36</p>
          <p className="text-xl">Titre de section — 22/30</p>
          <p className="text-lg">Titre de carte — 18/26</p>
          <p className="max-w-[var(--reading-max-w)] font-serif text-reading">Texte de lecture (sources, rapports) en serif 17/28, pour les longues lectures. Les réponses citent leurs passages<Citation n={1} source="rapport-annuel.pdf · p. 12" quote="Le chiffre d’affaires a progressé de 14 % sur l’exercice." onOpen={() => toast({ title: "Source ouverte au passage cité" })} /> et signalent un doute<Citation n={2} source="notes-reunion.md" quote="Lancement prévu au second semestre." verified={false} />.</p>
          <p className="text-base">Interface 15/24 — libellés, listes, formulaires.</p>
          <p className="text-sm text-text-muted">Secondaire 14/20 — métadonnées, aide.</p>
          <p className="font-mono text-xs text-text-subtle">Mono 12/16 — identifiants, durées 14:58</p>
        </div>
      </Section>

      <Section title="Boutons">
        <div className="flex flex-wrap items-center gap-3">
          <Button><Plus aria-hidden /> Nouveau notebook</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="soft"><Sparkles aria-hidden /> Générer</Button>
          <Button variant="ghost">Discret</Button>
          <Button variant="danger"><Trash2 aria-hidden /> Supprimer</Button>
          <Button loading>Import en cours</Button>
          <Button disabled>Indisponible</Button>
          <Tooltip label="Partager"><Button size="icon" variant="ghost" aria-label="Partager"><Share2 aria-hidden /></Button></Tooltip>
          <Button size="sm">Petit</Button><Button size="lg">Grand</Button>
        </div>
      </Section>

      <Section title="Champs">
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="title" label="Titre du notebook" hint="Visible par les personnes avec qui vous partagez."><Input placeholder="Sans titre" /></Field>
          <Field id="url" label="Adresse web" error="Cette page est réservée aux abonnés : son contenu n’est pas accessible."><Input defaultValue="https://journal.example/article" /></Field>
          <Field id="prompt" label="Consignes de génération"><Textarea placeholder="Ex. : public débutant, ton direct, 10 questions." /></Field>
          <div className="grid content-start gap-4">
            <SearchInput aria-label="Rechercher des notebooks" placeholder="Rechercher" />
            <label className="flex items-center gap-2.5 text-sm"><Checkbox defaultChecked /> Inclure cette source</label>
            <label className="flex items-center gap-2.5 text-sm"><Switch defaultChecked /> Me notifier à la fin d’une génération</label>
          </div>
        </div>
      </Section>

      <Section title="Navigation · onglets · menus · modale">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs defaultValue="all">
            <TabsList aria-label="Filtrer les notebooks">
              <TabsTrigger value="all">Tous</TabsTrigger>
              <TabsTrigger value="mine">Les miens</TabsTrigger>
              <TabsTrigger value="shared">Partagés</TabsTrigger>
              <TabsTrigger value="explore">Explorer</TabsTrigger>
            </TabsList>
            <TabsContent value="all" />
          </Tabs>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Affichage" className="flex rounded-md border p-0.5">
              <Button size="icon-sm" variant="ghost" aria-label="Grille" aria-pressed="false"><LayoutGrid aria-hidden /></Button>
              <Button size="icon-sm" variant="soft" aria-label="Liste" aria-pressed="true"><List aria-hidden /></Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Actions du notebook"><MoreVertical aria-hidden /></Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem icon={<Pencil aria-hidden />}>Renommer</DropdownMenuItem>
                <DropdownMenuItem icon={<Share2 aria-hidden />}>Partager</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger icon={<Trash2 aria-hidden />}>Supprimer</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog>
              <DialogTrigger asChild><Button variant="secondary">Supprimer…</Button></DialogTrigger>
              <DialogContent size="sm" title="Supprimer « Étude de marché » ?" description="Les 12 sources, les notes et les contenus générés seront supprimés définitivement.">
                <div className="flex justify-end gap-2">
                  <DialogClose asChild><Button variant="secondary">Annuler</Button></DialogClose>
                  <DialogClose asChild><Button variant="danger" onClick={() => toast({ title: "Notebook supprimé", tone: "success" })}>Supprimer</Button></DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </Section>

      <Section title="Espace de travail (3 panneaux, repliables)">
        <div className="grid gap-3 lg:h-[560px] lg:grid-cols-[auto_1fr_var(--panel-studio-w)]">
          <Panel id="sources" title="Sources" collapsed={!sourcesOpen} onToggle={() => setSourcesOpen((o) => !o)} className={sourcesOpen ? "lg:w-[var(--panel-sources-w)]" : ""}
            actions={<Button size="icon-sm" variant="ghost" aria-label="Ajouter des sources"><Plus aria-hidden /></Button>}>
            <div className="grid gap-0.5 p-2">
              <ListRow icon={<FileText />} title="rapport-annuel-2025.pdf" meta="48 pages" trailing={<Checkbox defaultChecked aria-label="Inclure rapport-annuel-2025.pdf" />} />
              <ListRow icon={<Globe />} title="Article · L’économie circulaire" meta="journal.example" trailing={<Checkbox defaultChecked aria-label="Inclure l’article" />} />
              <ListRow icon={<Mic />} title="entretien-client.m4a" meta="Transcription…" trailing={<Badge tone="accent">62 %</Badge>} />
              <div className="px-3 py-1"><Progress value={62} label="Transcription de entretien-client.m4a" /></div>
              <ListRow icon={<FileText />} title="contrat-v3.docx" meta="Échec : fichier protégé" trailing={<Badge tone="danger">Erreur</Badge>} />
            </div>
          </Panel>
          <section aria-label="Conversation" className="flex min-h-0 flex-col rounded-xl border bg-surface-raised">
            <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
              <div className="mx-auto grid max-w-[var(--chat-max-w)] gap-6">
                <div className="justify-self-end rounded-xl rounded-br-xs bg-surface px-4 py-2.5 text-sm">Quelles sont les priorités pour 2026 ?</div>
                <div className="font-serif text-reading">Trois priorités ressortent : réduire les coûts logistiques<Citation n={1} source="rapport-annuel-2025.pdf · p. 4" quote="Objectif : –8 % de coûts logistiques d’ici fin 2026." />, ouvrir deux marchés européens<Citation n={2} source="rapport-annuel-2025.pdf · p. 9" quote="Ouverture prévue en Espagne et en Italie." /> et former les équipes à l’IA<Citation n={3} source="entretien-client.m4a · 12:40" quote="On veut que chaque équipe soit autonome sur ces outils." />.</div>
                <div className="grid gap-2" aria-busy="true" aria-label="Réponse en cours">
                  <Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-9/12" /><Skeleton className="h-4 w-10/12" />
                </div>
              </div>
            </div>
            <div className="border-t p-3">
              <div className="mx-auto flex max-w-[var(--chat-max-w)] items-end gap-2 rounded-xl border border-border-input bg-surface-raised p-2 focus-within:border-focus">
                <Button size="icon-sm" variant="ghost" aria-label="Réglages du chat"><SlidersHorizontal aria-hidden /></Button>
                <textarea rows={1} aria-label="Votre question" placeholder="Posez une question sur vos sources…" className="min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-text-subtle" />
                <span className="hidden pb-2 text-xs text-text-subtle sm:inline">3 sources</span>
                <Button size="icon-sm" aria-label="Envoyer"><ArrowUp aria-hidden /></Button>
              </div>
              <p className="mt-2 text-center text-xs text-text-subtle">Les réponses peuvent contenir des erreurs : vérifiez les citations.</p>
            </div>
          </section>
          <Panel id="studio" title="Studio">
            <div className="grid grid-cols-2 gap-2 p-3">
              {studioTools.map(([label, Icon]) => (
                <Button key={label} variant="secondary" className="h-auto justify-start py-2.5"><Icon aria-hidden /> {label}</Button>
              ))}
            </div>
            <div className="grid gap-0.5 border-t p-2">
              <ListRow icon={<FileAudio />} title="Les priorités 2026 en 12 minutes" meta="Audio · 3 sources · il y a 5 min" trailing={<span role="img" aria-label="Non lu" className="size-2 rounded-pill bg-accent" />} />
              <ListRow icon={<BookOpen />} title="Note de synthèse" meta="Génération en cours" trailing={<Badge tone="accent">En cours</Badge>} />
            </div>
          </Panel>
        </div>
      </Section>

      <Section title="Cartes et table">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {["Étude de marché", "Thèse — chapitre 2", "Onboarding RH", "Veille IA"].map((t, i) => (
            <Card key={t} interactive className="grid gap-6 p-4">
              <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-accent-soft text-on-accent-soft"><BookOpen className="size-4" /></span>
              <div>
                <a href="#" className="font-semibold after:absolute after:inset-0">{t}</a>
                <p className="text-xs text-text-subtle">{3 + i * 4} sources · 9 nov. 2026</p>
              </div>
            </Card>
          ))}
        </div>
        <Table>
          <caption className="sr-only">Notebooks récents</caption>
          <thead><tr><Th>Titre</Th><Th>Sources</Th><Th aria-sort="descending">Création</Th><Th>Rôle</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {([["Étude de marché", 12, "9 nov. 2026", "Propriétaire"], ["Veille IA", 27, "2 nov. 2026", "Lecteur"]] as const).map(([t, s, d, r]) => (
              <Tr key={t}><Td className="font-medium">{t}</Td><Td>{s} sources</Td><Td className="text-text-muted">{d}</Td><Td><Badge>{r}</Badge></Td>
                <Td className="w-12"><Button size="icon-sm" variant="ghost" aria-label={`Actions pour ${t}`}><MoreVertical aria-hidden /></Button></Td></Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section title="États vides · chargement · alertes · notifications">
        <div className="grid gap-4 md:grid-cols-2">
          <Card><EmptyState icon={<Inbox />} title="Aucune source pour l’instant" action={<Button><Plus aria-hidden /> Ajouter des sources</Button>}>Importez des PDF, des pages web ou du texte : les réponses citeront exactement ces documents.</EmptyState></Card>
          <Card className="grid content-start gap-3 p-4" aria-busy="true" aria-label="Chargement des notebooks">
            {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-9 rounded-lg" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>)}
            <Progress label="Chargement" />
          </Card>
        </div>
        <Alert tone="warning" title="Vous approchez de votre limite mensuelle" action={<Button size="sm" variant="secondary">Voir les offres</Button>}>Il vous reste 24 crédits, renouvelés le 1er décembre.</Alert>
        <Alert tone="danger" title="Import impossible">Le fichier dépasse 200 Mo.</Alert>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => toast({ title: "Résumé audio prêt", description: "« Les priorités 2026 » · 12 min", tone: "success", action: { label: "Écouter", onClick: () => {} } })}>Notification succès</Button>
          <Button variant="secondary" onClick={() => toast({ title: "La génération a échoué", description: "Votre crédit a été restitué.", tone: "error", action: { label: "Réessayer", onClick: () => {} } })}>Notification erreur</Button>
        </div>
      </Section>
    </main>
  );
}

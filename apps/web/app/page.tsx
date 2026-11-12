import Link from "next/link";
import { ArrowRight, ArrowUpRight, AudioLines, BookOpen, Check, ChevronRight, FileSearch, FileText, Headphones, Layers3, LockKeyhole, MessageCircleQuestion, Mic, Network, Quote, Scale, Search, Sparkles, Telescope, TriangleAlert, UploadCloud } from "lucide-react";
import { createUserClient, getUser } from "@/lib/supabase/server";
import { Dashboard, type NotebookRow } from "./dashboard";

export default async function HomePage() {
  const user = await getUser();
  if (!user) return <PublicHome />;

  const supabase = await createUserClient();
  const [{ data: notebooks, error }, { data: profile }, { data: workspaces }] = await Promise.all([
    supabase.from("notebooks").select("id, title, emoji, workspace_id, created_by, created_at, last_activity_at, public_slug, sources(count)")
      .order("last_activity_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("dashboard_view, display_name").eq("id", user.id).single(),
    supabase.from("workspaces").select("id").eq("owner_id", user.id),
  ]);
  const mine = new Set((workspaces ?? []).map((w) => w.id));
  const rows: NotebookRow[] = (notebooks ?? []).map((n) => ({
    id: n.id, title: n.title, emoji: n.emoji, createdAt: n.created_at, lastActivityAt: n.last_activity_at,
    sourceCount: (n.sources as unknown as { count: number }[])[0]?.count ?? 0,
    owned: mine.has(n.workspace_id),
    isPublic: Boolean(n.public_slug),
  }));

  return <div className="min-h-dvh"><Dashboard initial={rows} loadError={Boolean(error)} initialView={(profile?.dashboard_view as "grid" | "list") ?? "list"} name={profile?.display_name ?? null} /></div>;
}

function PublicHome() {
  return (
    <main className="min-h-screen overflow-hidden bg-bg text-text">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-surface-raised focus:px-4 focus:py-3">Aller au contenu</a>
      <header className="relative z-20 border-b border-border/80 bg-bg/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[var(--page-max-w)] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="Leanna Notebook, accueil" className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-raised"><img src="/logo.png" alt="" className="size-full object-contain" /></span>
            <span className="text-[1.05rem] font-semibold tracking-tight">Leanna<span className="font-normal text-text-muted"> Notebook</span></span>
          </Link>
          <nav aria-label="Navigation principale" className="hidden items-center gap-8 text-sm text-text-muted md:flex">
            <a href="#fonctionnalites" className="transition-colors hover:text-text">Fonctionnalités</a>
            <a href="#recherche" className="transition-colors hover:text-text">Recherche & graphe</a>
            <a href="#studio-vocal" className="transition-colors hover:text-text">Studio vocal</a>
            <a href="#methode" className="transition-colors hover:text-text">Comment ça marche</a>
            <a href="#confiance" className="transition-colors hover:text-text">Confidentialité</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text">Connexion</Link>
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover focus-visible:outline-offset-4">Créer un compte <ArrowUpRight size={15} /></Link>
          </div>
        </div>
      </header>

      <section id="contenu" className="relative isolate">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-40 -top-32 size-[34rem] rounded-full bg-accent/10 blur-[100px]" />
          <div className="absolute -left-48 top-72 size-[30rem] rounded-full bg-[#d9c6a4]/20 blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "radial-gradient(currentColor 0.7px, transparent 0.7px)", backgroundSize: "18px 18px" }} />
        </div>
        <div className="mx-auto grid max-w-[var(--page-max-w)] items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12 lg:pb-28 lg:pt-24">
          <div className="max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised/80 px-3 py-1.5 text-xs font-medium text-text-muted shadow-xs">
              <span className="size-1.5 rounded-full bg-success" /> Votre espace de recherche documentaire augmenté par l’IA
            </div>
            <h1 className="max-w-[46rem] text-pretty font-serif text-[2.8rem] leading-[1.06] tracking-[-0.045em] sm:text-6xl lg:text-[4.25rem]">
              Vos documents deviennent <span className="text-accent">des connaissances exploitables.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-text-muted sm:text-lg">
              Réunissez vos PDF, pages web et notes dans un même espace. Posez vos questions à Leanna, confiez-lui une recherche approfondie sur le web, explorez le graphe des liens entre vos documents, repérez leurs contradictions, puis créez dans le Studio des rapports, synthèses, quiz, chronologies et bien plus.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-on-accent shadow-[0_8px_24px_rgba(15,76,138,0.18)] transition hover:-translate-y-0.5 hover:bg-accent-hover">Commencer gratuitement <ArrowRight size={17} /></Link>
              <a href="#methode" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-raised/80 px-6 py-3 text-sm font-semibold transition hover:bg-surface">Découvrir la méthode <ChevronRight size={16} /></a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-subtle">
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> Vos documents réunis dans un notebook</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> Réponses appuyées par les sources</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> Recherche approfondie et graphe de connaissances</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[650px] lg:ml-auto">
            <div aria-hidden className="absolute -inset-5 rounded-[2rem] bg-accent/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-border-strong/80 bg-surface-raised shadow-[0_28px_90px_rgba(28,27,25,0.14)]">
              <div className="flex h-12 items-center justify-between border-b border-border bg-surface/70 px-4">
                <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#d98b79]" /><span className="size-2 rounded-full bg-[#d6b66f]" /><span className="size-2 rounded-full bg-[#75aa87]" /><span className="ml-3 text-xs font-medium text-text-muted">Votre notebook · Démonstration</span></div>
                <span className="rounded-md bg-success-soft px-2 py-1 text-[10px] font-semibold text-success">APERÇU</span>
              </div>
              <div className="grid min-h-[390px] grid-cols-[142px_1fr] sm:grid-cols-[178px_1fr]">
                <aside className="border-r border-border bg-surface/50 p-3 sm:p-4">
                  <div className="mb-5 flex items-center gap-2 text-xs font-semibold"><span className="grid size-6 place-items-center rounded-md bg-accent text-on-accent"><BookOpen size={13} /></span> Mon espace de recherche</div>
                  <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-subtle">Sources · 04</p>
                  {["Rapport annuel.pdf","Étude de marché.pdf","Article web","Notes de réunion"].map((s,i)=><div key={s} className="mb-1 flex items-center gap-2 rounded-md px-2 py-2 text-[10px] text-text-muted"><FileText size={12} className={i===0?"text-accent":"text-text-subtle"} /> <span className="truncate">{s}</span></div>)}
                  <div className="mt-5 rounded-lg border border-dashed border-border-strong p-3 text-center"><UploadCloud size={16} className="mx-auto mb-1 text-text-subtle" /><span className="text-[9px] text-text-subtle">Ajouter une source</span></div>
                </aside>
                <div className="flex min-w-0 flex-col p-4 sm:p-6">
                  <div className="mb-5"><p className="text-[10px] font-medium uppercase tracking-[0.15em] text-accent">Leanna · Recherche documentaire</p><h3 className="mt-1 font-serif text-xl tracking-tight sm:text-2xl">Explorer et recouper mes sources</h3><p className="mt-1 text-[10px] text-text-subtle">4 sources · Citations vérifiables</p></div>
                  <div className="mb-4 max-w-[90%] self-end rounded-xl rounded-br-sm bg-accent px-3.5 py-3 text-[11px] leading-5 text-on-accent shadow-sm">Crée une synthèse des points clés et indique les passages qui les justifient.</div>
                  <div className="flex gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-on-accent-soft"><Sparkles size={14} /></span>
                    <div className="min-w-0 flex-1 rounded-xl border border-border bg-bg p-3.5">
                      <p className="text-[11px] leading-5 text-text-muted">Voici les éléments qui ressortent des sources sélectionnées. Chaque point doit être vérifié dans son extrait d’origine avant d’être repris comme conclusion.</p>
                      <div className="mt-3 rounded-lg border border-border bg-surface/70 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold text-accent"><Quote size={11} /> SOURCE 01 · RAPPORT ANNUEL.PDF</div>
                        <p className="text-[10px] leading-4 text-text-muted">« Les investissements ont progressé sur la période étudiée… »</p>
                        <p className="mt-1 text-[9px] text-text-subtle">Page 12 · Passage cité</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-md bg-success-soft px-2 py-1 text-[9px] font-medium text-success">Réponse référencée</span><span className="rounded-md bg-surface px-2 py-1 text-[9px] text-text-subtle">Sources consultées : 4</span></div>
                    </div>
                  </div>
                  <div className="mt-auto pt-5"><div className="flex items-center gap-2 rounded-xl border border-border-strong bg-bg px-3 py-3 text-[10px] text-text-subtle"><Search size={13} /> Posez une question ou demandez un livrable… <span className="ml-auto rounded-md bg-surface px-2 py-1">↵</span></div><p className="mt-2 text-center text-[9px] text-text-subtle">Illustration fictive de l’interface</p></div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3 shadow-lg sm:flex"><span className="grid size-9 place-items-center rounded-lg bg-success-soft text-success"><FileSearch size={18} /></span><span><strong className="block text-xs">Citations vérifiables</strong><span className="text-[10px] text-text-subtle">Revenez au document et à la page</span></span></div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface/55">
        <div className="mx-auto grid max-w-[var(--page-max-w)] gap-5 px-5 py-7 sm:grid-cols-3 sm:px-8">
          {[{icon:Layers3,title:"Centralisez vos sources",desc:"PDF, pages web et notes regroupés par sujet."},{icon:Sparkles,title:"Interrogez vos documents",desc:"Questionnez vos sources à l’écrit ou à la voix."},{icon:Quote,title:"Vérifiez les réponses",desc:"Retrouvez les extraits et les pages à l’origine des réponses."}].map((x)=><div key={x.title} className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-raised text-accent"><x.icon size={17}/></span><div><h2 className="text-sm font-semibold">{x.title}</h2><p className="mt-1 text-xs leading-5 text-text-muted">{x.desc}</p></div></div>)}
        </div>
      </section>

      <section id="fonctionnalites" className="mx-auto max-w-[var(--page-max-w)] px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Un espace, plusieurs usages</p><h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">De vos sources à des livrables concrets.</h2><p className="mt-5 text-base leading-7 text-text-muted">Leanna Notebook réunit collecte documentaire, recherche assistée par IA, conversation vocale et création de livrables dans un même espace.</p></div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Feature icon={UploadCloud} number="01" title="Rassemblez vos sources" desc="Importez vos PDF, pages web et notes dans des notebooks thématiques. Gardez les documents et leur provenance au même endroit." tags={["PDF & documents","Pages web","Notes & textes"]}/>
          <Feature icon={FileSearch} number="02" title="Traitez aussi les PDF scannés" desc="L’extraction des PDF natifs se fait page par page. Activez l’OCR OpenRouter pour les scans sans couche texte et choisissez votre modèle dans les réglages." tags={["PDF volumineux","OCR configurable","Repères de page"]}/>
          <Feature icon={Search} number="03" title="Interrogez et vérifiez" desc="Posez vos questions en langage naturel. Leanna recherche dans vos sources et rattache ses réponses aux passages pertinents pour faciliter la vérification." tags={["Recherche documentaire","Citations","Contexte"]}/>
          <Feature icon={FileText} number="04" title="Créez dans le Studio" desc="Demandez un livrable depuis le chat : rapport, synthèse, guide, fiches, quiz, carte mentale, infographie, chronologie, comparatif, FAQ ou plan d’étude. Le résultat est généré dans le Studio." tags={["Création depuis le chat","14 formats","Exports"]}/>
          <Feature icon={AudioLines} number="05" title="Échangez avec Leanna et Roxane" desc="Parlez à Leanna en direct. Activez Roxane comme seconde voix pour questionner une analyse, apporter des nuances et poursuivre l’échange naturellement." tags={["Gemini Live","Duo vocal","Voix à la demande"]}/>
          <Feature icon={Headphones} number="06" title="Écoutez vos recherches" desc="Générez un Audio Overview dialogué à deux voix et retrouvez le fichier audio dans vos livrables Studio. Exportez également les documents prêts." tags={["Audio Overview","MP3","Markdown · HTML · JSON"]}/>
        </div>
      </section>

      <section id="recherche" className="mx-auto grid max-w-[var(--page-max-w)] items-center gap-12 px-5 pb-20 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:pb-28">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent"><Telescope size={15}/> Recherche & connaissance</p>
          <h2 className="mt-4 max-w-2xl font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Leanna cherche, relie et <span className="text-accent">vérifie pour vous.</span></h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-text-muted">Posez une question de fond : Leanna planifie la recherche, lit les pages web en entier, ajoute les sources pertinentes à votre notebook et rédige un rapport cité. Vos documents forment ensuite un graphe de connaissances, et chaque écart entre eux vous est signalé.</p>
          <div className="mt-8 grid gap-5">
            <Pillar icon={Telescope} title="Recherche approfondie" desc="Plan, recherches multi-angles, lecture complète des pages, recoupement et rapport cité dans le Studio. Suivez chaque étape en direct, mettez en pause, reprenez ou ajoutez une consigne."/>
            <Pillar icon={Network} title="Graphe de connaissances" desc="Personnes, organisations, lieux, technologies et leurs relations, extraits de toutes vos sources. Cliquez sur un lien pour voir le document et le passage exact qui le justifient."/>
            <Pillar icon={Scale} title="Détection des contradictions" desc="Dates, montants et quantités sont comparés entre vos documents. Chaque écart présente les deux passages ; vous confirmez, rejetez ou expliquez, et l’historique est conservé."/>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[560px]">
          <div aria-hidden className="absolute -inset-5 rounded-[2rem] bg-accent/10 blur-2xl"/>
          <div className="relative grid gap-4">
            <div className="rounded-2xl border border-border-strong bg-surface-raised p-5 shadow-[0_18px_60px_rgba(28,27,25,0.10)]">
              <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Recherche approfondie</p><span className="rounded-full bg-accent-soft px-2 py-0.5 text-[9px] font-semibold text-on-accent-soft">Vérification</span></div>
              <p className="mt-2 text-sm font-semibold">Comparer les technologies de stockage d’énergie</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full w-[62%] rounded-full bg-accent"/></div>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[["10","requêtes"],["18","pages lues"],["8","retenues"],["10","écartées"]].map(([v,l])=><div key={l} className="flex flex-col-reverse rounded-lg bg-bg py-2"><dt className="text-[9px] text-text-subtle">{l}</dt><dd className="text-sm font-semibold tabular-nums">{v}</dd></div>)}
              </dl>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
              <div className="rounded-2xl border border-border-strong bg-surface-raised p-4 shadow-[0_18px_60px_rgba(28,27,25,0.10)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Graphe</p>
                <svg viewBox="0 0 200 120" className="mt-2 w-full" role="img" aria-label="Exemple de graphe de connaissances">
                  <g stroke="var(--border-strong)" strokeWidth="1.2"><line x1="100" y1="60" x2="40" y2="28"/><line x1="100" y1="60" x2="160" y2="30"/><line x1="100" y1="60" x2="52" y2="98"/><line x1="100" y1="60" x2="158" y2="96" strokeDasharray="4 3"/><line x1="160" y1="30" x2="158" y2="96"/></g>
                  <circle cx="100" cy="60" r="12" fill="#a855f7" fillOpacity=".8"/><circle cx="40" cy="28" r="8" fill="#3b82f6" fillOpacity=".8"/><circle cx="160" cy="30" r="9" fill="#06b6d4" fillOpacity=".8"/><circle cx="52" cy="98" r="7" fill="#10b981" fillOpacity=".8"/><circle cx="158" cy="96" r="7" fill="#f59e0b" fillOpacity=".8"/>
                </svg>
                <p className="mt-1 text-[10px] text-text-subtle">Pointillés : relation déduite, signalée comme hypothèse</p>
              </div>
              <div className="rounded-2xl border border-border-strong bg-surface-raised p-4 shadow-[0_18px_60px_rgba(28,27,25,0.10)]">
                <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-warning"><TriangleAlert size={12}/> Contradiction</p>
                <p className="mt-2 text-xs font-semibold">Date de lancement du projet</p>
                <p className="mt-2 rounded-md bg-bg px-2 py-1.5 text-[10px] text-text-muted">« lancé en mars 2024 » — Rapport A</p>
                <p className="mt-1.5 rounded-md bg-bg px-2 py-1.5 text-[10px] text-text-muted">« lancé en septembre 2024 » — Article B</p>
                <div className="mt-2 flex gap-1.5"><span className="rounded-md bg-success-soft px-2 py-1 text-[9px] font-medium text-success">Confirmer</span><span className="rounded-md bg-surface px-2 py-1 text-[9px] text-text-subtle">Rejeter</span></div>
              </div>
            </div>
            <p className="text-center text-[9px] text-text-subtle">Illustration fictive de l’interface</p>
          </div>
        </div>
      </section>

      <section id="studio-vocal" className="relative overflow-hidden border-y border-border bg-surface/60">
        <div aria-hidden className="pointer-events-none absolute -right-24 top-0 size-[28rem] rounded-full bg-accent/10 blur-[100px]" />
        <div className="relative mx-auto grid max-w-[var(--page-max-w)] items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:gap-16 lg:py-28">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent"><AudioLines size={15}/> Le studio vocal</p>
            <h2 className="mt-4 max-w-2xl font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Vos sources ne sont plus silencieuses. <span className="text-accent">Parlez-en.</span></h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-text-muted">Ouvrez une conversation Gemini Live avec Leanna, posez vos questions naturellement et demandez-lui de rechercher dans vos documents. Roxane peut rejoindre l’échange comme seconde voix. Vous pouvez aussi demander oralement la création d’un livrable : Leanna lance alors sa génération dans le Studio au lieu de réciter le document.</p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-on-accent-soft"><Headphones size={19}/></span>
                <div><h3 className="text-sm font-semibold">Leanna, votre spécialiste documentaire</h3><p className="mt-1 text-xs leading-5 text-text-muted">Elle recherche dans vos sources, explique les éléments importants et peut lancer la création d’un rapport ou d’un autre livrable dans le Studio.</p></div>
              </div>
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-raised text-accent ring-1 ring-border"><MessageCircleQuestion size={19}/></span>
                <div><h3 className="text-sm font-semibold">Roxane, le regard complémentaire</h3><p className="mt-1 text-xs leading-5 text-text-muted">Activez cette seconde voix à la demande pour questionner une interprétation, relever les nuances et apporter un regard complémentaire.</p></div>
              </div>
            </div>
            <ul className="mt-8 grid gap-2 text-xs text-text-muted sm:grid-cols-2">
              <li className="flex items-center gap-2"><Check size={14} className="text-success"/> Conversation naturelle à la voix</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-success"/> Roxane activable à la demande</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-success"/> Recherche ancrée dans vos sources</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-success"/> Création de livrables à la voix</li>
            </ul>
            <Link href="/signup" className="mt-9 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-on-accent shadow-sm transition hover:-translate-y-0.5 hover:bg-accent-hover">Découvrir Leanna Notebook <ArrowRight size={17}/></Link>
          </div>

          <div className="relative mx-auto w-full max-w-[520px]">
            <div aria-hidden className="absolute -inset-5 rounded-[2rem] bg-accent/10 blur-2xl"/>
            <div className="relative overflow-hidden rounded-[1.6rem] border border-border-strong bg-surface-raised shadow-[0_24px_80px_rgba(28,27,25,0.13)]">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Conversation en direct</p><h3 className="mt-1 text-sm font-semibold">Votre studio vocal</h3></div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-semibold text-success"><span className="size-1.5 rounded-full bg-success"/> Prêt à échanger</span>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3.5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent"><Headphones size={20}/></span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Leanna</p><p className="text-[11px] text-text-subtle">Analyse vos sources et vous répond</p></div>
                  <span className="rounded-full bg-success-soft px-2 py-1 text-[9px] font-semibold text-success">Principale</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3.5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#e9e1f4] text-[#624b86]"><MessageCircleQuestion size={20}/></span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Roxane</p><p className="text-[11px] text-text-subtle">Seconde voix, activée à votre demande</p></div>
                  <span className="rounded-full bg-surface px-2 py-1 text-[9px] font-semibold text-text-muted">Optionnelle</span>
                </div>
                <div className="rounded-xl bg-bg p-4">
                  <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-subtle">Exemple d’échange</p>
                  <div className="mb-3 flex gap-2.5"><span className="grid size-6 shrink-0 place-items-center rounded-lg bg-accent-soft text-on-accent-soft"><Headphones size={13}/></span><div><p className="text-[10px] font-semibold text-accent">Leanna</p><p className="mt-1 text-xs leading-5 text-text-muted">« Dans les documents, les investissements progressent, mais cette hausse concerne surtout deux périodes précises. Je peux vous montrer les passages concernés. »</p></div></div>
                  <div className="flex gap-2.5"><span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#e9e1f4] text-[#624b86]"><MessageCircleQuestion size={13}/></span><div><p className="text-[10px] font-semibold text-[#8064a8]">Roxane</p><p className="mt-1 text-xs leading-5 text-text-muted">« Est-ce que cette progression est constante, ou dépend-elle d’un événement ponctuel ? Il faudrait comparer les périodes avant de conclure. »</p></div></div>
                </div>
                <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-4">
                  <span className="grid size-9 place-items-center rounded-full bg-accent text-on-accent"><Mic size={17}/></span>
                  <div className="flex gap-1 items-center" aria-label="Visualisation sonore"><span className="h-3 w-1 rounded-full bg-accent/50"/><span className="h-6 w-1 rounded-full bg-accent"/><span className="h-4 w-1 rounded-full bg-accent/70"/><span className="h-7 w-1 rounded-full bg-accent"/><span className="h-3 w-1 rounded-full bg-accent/50"/><span className="h-5 w-1 rounded-full bg-accent/80"/><span className="h-2 w-1 rounded-full bg-accent/50"/></div>
                  <span className="text-[10px] font-medium text-text-muted">Parlez à vos sources</span>
                </div>
                <p className="text-center text-[9px] text-text-subtle">Illustration d’une expérience vocale · Exemple de dialogue</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="methode" className="bg-[#172b3b] text-white">
        <div className="mx-auto grid max-w-[var(--page-max-w)] gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:py-24">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9bc9d4]">Votre méthode de travail</p><h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">De la source au livrable, gardez le fil.</h2><p className="mt-5 max-w-md text-sm leading-7 text-white/70">Un parcours lisible pour passer de documents dispersés à une production structurée, tout en gardant la possibilité de vérifier les informations.</p><Link href="/signup" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#172b3b] transition hover:bg-[#e8f1f2]">Créer mon espace <ArrowRight size={16}/></Link></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[{n:"01",icon:UploadCloud,t:"Collecter",d:"Importez vos PDF, pages web et notes dans un notebook dédié."},{n:"02",icon:Search,t:"Explorer",d:"Posez une question à Leanna et retrouvez les passages pertinents."},{n:"03",icon:Network,t:"Recouper",d:"Explorez le graphe des liens entre vos sources et traitez les contradictions détectées."},{n:"04",icon:FileText,t:"Structurer",d:"Générez un rapport, un guide ou un autre format depuis le chat ou le Studio vocal."}].map(x=><div key={x.n} className="rounded-xl border border-white/15 bg-white/[0.06] p-5"><div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-lg bg-white/10 text-[#b9e0e4]"><x.icon size={17}/></span><span className="font-mono text-xs text-white/40">{x.n}</span></div><h3 className="mt-5 text-base font-semibold">{x.t}</h3><p className="mt-2 text-xs leading-5 text-white/65">{x.d}</p></div>)}
          </div>
        </div>
      </section>

      <section id="confiance" className="mx-auto grid max-w-[var(--page-max-w)] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-24">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Maîtrise & transparence</p><h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Vos documents restent sous votre contrôle.</h2><p className="mt-5 max-w-xl text-sm leading-7 text-text-muted">L’IA vous aide à explorer vos documents ; vous gardez la responsabilité de vérifier les sources, d’interpréter les résultats et de choisir ce que vous partagez.</p></div>
        <div className="grid gap-4">
          <Trust icon={LockKeyhole} title="Vos notebooks sont privés par défaut" desc="Vous choisissez explicitement si un notebook doit être partagé publiquement."/>
          <Trust icon={Quote} title="Des réponses reliées aux sources" desc="Les citations permettent de revenir aux passages d’origine et de vérifier leur contexte."/>
          <Trust icon={Layers3} title="Un espace organisé par projet" desc="Chaque notebook rassemble les documents, conversations et livrables d’un même sujet."/>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:pb-28">
        <div className="mx-auto max-w-[var(--page-max-w)] overflow-hidden rounded-2xl bg-accent px-6 py-12 text-on-accent sm:px-12 sm:py-16">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-75">Prêt à commencer ?</p><h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Transformez vos documents en travail exploitable.</h2><p className="mt-4 max-w-xl text-sm leading-6 opacity-80">Créez un notebook, importez vos premières sources et commencez à les explorer avec Leanna.</p></div>
            <Link href="/signup" className="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#123d62] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#edf5fa]">Créer mon compte <ArrowUpRight size={17}/></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-surface/55">
        <div className="mx-auto flex max-w-[var(--page-max-w)] flex-col gap-5 px-5 py-8 text-xs text-text-subtle sm:px-8 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-text"><span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-raised"><img src="/logo.png" alt="" className="size-full object-contain" /></span> Leanna Notebook</Link>
          <p>Recherche documentaire et approfondie, graphe de connaissances, conversation vocale et création dans le Studio.</p>
          <div className="flex flex-wrap gap-5"><Link href="/login" className="hover:text-text">Connexion</Link><Link href="/signup" className="hover:text-text">Créer un compte</Link><Link href="/privacy" className="hover:text-text">Confidentialité</Link><Link href="/terms" className="hover:text-text">Conditions</Link></div>
        </div>
      </footer>
    </main>
  );
}

function Feature({icon:Icon,number,title,desc,tags}:{icon:typeof BookOpen;number:string;title:string;desc:string;tags:string[]}) {
  return <article className="group rounded-2xl border border-border bg-surface-raised p-6 shadow-xs transition duration-200 hover:-translate-y-1 hover:shadow-lg"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-on-accent-soft"><Icon size={19}/></span><span className="font-mono text-[10px] text-text-subtle">{number}</span></div><h3 className="mt-6 text-base font-semibold tracking-tight">{title}</h3><p className="mt-3 min-h-[5rem] text-sm leading-6 text-text-muted">{desc}</p><div className="mt-5 flex flex-wrap gap-1.5">{tags.map(t=><span key={t} className="rounded-md bg-surface px-2 py-1 text-[10px] text-text-subtle">{t}</span>)}</div></article>;
}

function Pillar({icon:Icon,title,desc}:{icon:typeof BookOpen;title:string;desc:string}) {
  return <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-on-accent-soft"><Icon size={19}/></span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-text-muted">{desc}</p></div></div>;
}

function Trust({icon:Icon,title,desc}:{icon:typeof BookOpen;title:string;desc:string}) {
  return <div className="flex gap-4 rounded-xl border border-border bg-surface-raised p-5"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-on-accent-soft"><Icon size={18}/></span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-text-muted">{desc}</p></div></div>;
}

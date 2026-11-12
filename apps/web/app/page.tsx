import Link from "next/link";
import { ArrowRight, ArrowUpRight, AudioLines, BookOpen, Check, ChevronRight, FileSearch, FileText, Globe2, Layers3, LockKeyhole, Network, Play, Quote, Search, Sparkles, UploadCloud, Workflow } from "lucide-react";
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
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-on-accent shadow-sm"><BookOpen size={19} strokeWidth={2.2} /></span>
            <span className="text-[1.05rem] font-semibold tracking-tight">Leanna<span className="font-normal text-text-muted"> Notebook</span></span>
          </Link>
          <nav aria-label="Navigation principale" className="hidden items-center gap-8 text-sm text-text-muted md:flex">
            <a href="#fonctionnalites" className="transition-colors hover:text-text">Fonctionnalités</a>
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
              <span className="size-1.5 rounded-full bg-success" /> Votre espace de recherche et de connaissance
            </div>
            <h1 className="max-w-[46rem] text-pretty font-serif text-[2.8rem] leading-[1.06] tracking-[-0.045em] sm:text-6xl lg:text-[4.25rem]">
              Vos sources ont des réponses. <span className="text-accent">Faites-les parler.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-text-muted sm:text-lg">
              Centralisez vos PDF, pages web et contenus, interrogez vos documents avec l’IA et retrouvez les passages qui justifient chaque réponse. De la première source au dossier structuré, gardez le fil de vos recherches.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-on-accent shadow-[0_8px_24px_rgba(15,76,138,0.18)] transition hover:-translate-y-0.5 hover:bg-accent-hover">Commencer gratuitement <ArrowRight size={17} /></Link>
              <a href="#methode" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-raised/80 px-6 py-3 text-sm font-semibold transition hover:bg-surface">Découvrir la méthode <ChevronRight size={16} /></a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-subtle">
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> Vos sources réunies au même endroit</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> Réponses avec références</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> Espace personnel</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[650px] lg:ml-auto">
            <div aria-hidden className="absolute -inset-5 rounded-[2rem] bg-accent/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-border-strong/80 bg-surface-raised shadow-[0_28px_90px_rgba(28,27,25,0.14)]">
              <div className="flex h-12 items-center justify-between border-b border-border bg-surface/70 px-4">
                <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#d98b79]" /><span className="size-2 rounded-full bg-[#d6b66f]" /><span className="size-2 rounded-full bg-[#75aa87]" /><span className="ml-3 text-xs font-medium text-text-muted">Espace de recherche · Démonstration</span></div>
                <span className="rounded-md bg-success-soft px-2 py-1 text-[10px] font-semibold text-success">APERÇU</span>
              </div>
              <div className="grid min-h-[390px] grid-cols-[142px_1fr] sm:grid-cols-[178px_1fr]">
                <aside className="border-r border-border bg-surface/50 p-3 sm:p-4">
                  <div className="mb-5 flex items-center gap-2 text-xs font-semibold"><span className="grid size-6 place-items-center rounded-md bg-accent text-on-accent"><BookOpen size={13} /></span> Mon notebook</div>
                  <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-subtle">Sources · 04</p>
                  {["Rapport annuel.pdf","Étude de marché.pdf","Article web","Notes de réunion"].map((s,i)=><div key={s} className="mb-1 flex items-center gap-2 rounded-md px-2 py-2 text-[10px] text-text-muted"><FileText size={12} className={i===0?"text-accent":"text-text-subtle"} /> <span className="truncate">{s}</span></div>)}
                  <div className="mt-5 rounded-lg border border-dashed border-border-strong p-3 text-center"><UploadCloud size={16} className="mx-auto mb-1 text-text-subtle" /><span className="text-[9px] text-text-subtle">Ajouter une source</span></div>
                </aside>
                <div className="flex min-w-0 flex-col p-4 sm:p-6">
                  <div className="mb-5"><p className="text-[10px] font-medium uppercase tracking-[0.15em] text-accent">Assistant de recherche</p><h3 className="mt-1 font-serif text-xl tracking-tight sm:text-2xl">Comprendre mes documents</h3><p className="mt-1 text-[10px] text-text-subtle">4 sources · Analyse documentaire</p></div>
                  <div className="mb-4 max-w-[90%] self-end rounded-xl rounded-br-sm bg-accent px-3.5 py-3 text-[11px] leading-5 text-on-accent shadow-sm">Quels sont les principaux enjeux et les chiffres à retenir de ces documents ?</div>
                  <div className="flex gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-on-accent-soft"><Sparkles size={14} /></span>
                    <div className="min-w-0 flex-1 rounded-xl border border-border bg-bg p-3.5">
                      <p className="text-[11px] leading-5 text-text-muted">Les documents font ressortir trois tendances principales : une évolution du marché, une concentration des investissements et de nouveaux enjeux opérationnels.</p>
                      <div className="mt-3 rounded-lg border border-border bg-surface/70 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold text-accent"><Quote size={11} /> SOURCE 01 · RAPPORT ANNUEL.PDF</div>
                        <p className="text-[10px] leading-4 text-text-muted">« Les investissements ont progressé sur la période étudiée… »</p>
                        <p className="mt-1 text-[9px] text-text-subtle">Page 12 · Passage cité</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-md bg-success-soft px-2 py-1 text-[9px] font-medium text-success">Réponse référencée</span><span className="rounded-md bg-surface px-2 py-1 text-[9px] text-text-subtle">Sources consultées : 4</span></div>
                    </div>
                  </div>
                  <div className="mt-auto pt-5"><div className="flex items-center gap-2 rounded-xl border border-border-strong bg-bg px-3 py-3 text-[10px] text-text-subtle"><Search size={13} /> Posez une question à vos sources… <span className="ml-auto rounded-md bg-surface px-2 py-1">↵</span></div><p className="mt-2 text-center text-[9px] text-text-subtle">Illustration fictive de l’interface</p></div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3 shadow-lg sm:flex"><span className="grid size-9 place-items-center rounded-lg bg-success-soft text-success"><FileSearch size={18} /></span><span><strong className="block text-xs">Réponses traçables</strong><span className="text-[10px] text-text-subtle">Retrouvez les passages sources</span></span></div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface/55">
        <div className="mx-auto grid max-w-[var(--page-max-w)] gap-5 px-5 py-7 sm:grid-cols-3 sm:px-8">
          {[{icon:Layers3,title:"Centraliser",desc:"PDF, textes, pages web et contenus dans un espace organisé."},{icon:Sparkles,title:"Comprendre",desc:"Posez vos questions et obtenez une synthèse de vos sources."},{icon:Quote,title:"Vérifier",desc:"Remontez aux passages cités pour contrôler les réponses."}].map((x)=><div key={x.title} className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-raised text-accent"><x.icon size={17}/></span><div><h2 className="text-sm font-semibold">{x.title}</h2><p className="mt-1 text-xs leading-5 text-text-muted">{x.desc}</p></div></div>)}
        </div>
      </section>

      <section id="fonctionnalites" className="mx-auto max-w-[var(--page-max-w)] px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Un espace, plusieurs usages</p><h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Passez de l’information à la connaissance.</h2><p className="mt-5 text-base leading-7 text-text-muted">Leanna Notebook vous accompagne tout au long de votre travail documentaire : collecter, analyser, relier et produire.</p></div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Feature icon={UploadCloud} number="01" title="Rassemblez vos sources" desc="Importez vos documents et contenus dans des notebooks thématiques. Gardez vos références organisées et retrouvez facilement l’origine de chaque information." tags={["PDF & documents","Pages web","Notes & textes"]}/>
          <Feature icon={Search} number="02" title="Interrogez votre corpus" desc="Posez vos questions en langage naturel. Obtenez des réponses contextualisées à partir des sources présentes dans votre espace, plutôt que de repartir de zéro." tags={["Questions ciblées","Synthèses","Réponses sourcées"]}/>
          <Feature icon={Network} number="03" title="Reliez les informations" desc="Faites émerger les entités, les thèmes et les liens entre plusieurs documents pour construire une vision d’ensemble et suivre les éléments importants." tags={["Relations","Chronologie","Recoupements"]}/>
          <Feature icon={FileText} number="04" title="Produisez des livrables" desc="Transformez votre travail en documents structurés : synthèses, notes, plans, analyses et supports prêts à être retravaillés." tags={["Synthèse","Analyse","Documents"]}/>
          <Feature icon={Globe2} number="05" title="Explorez et partagez" desc="Découvrez des notebooks rendus publics par leurs auteurs et partagez vos propres travaux lorsque vous choisissez de les rendre accessibles." tags={["Découverte","Liens publics","Contrôle d’accès"]}/>
          <Feature icon={Workflow} number="06" title="Suivez une méthode claire" desc="Conservez le contexte de votre recherche, passez des sources aux conclusions et revenez aux éléments qui étayent votre raisonnement." tags={["Traçabilité","Organisation","Continuité"]}/>
        </div>
      </section>

      <section id="methode" className="bg-[#172b3b] text-white">
        <div className="mx-auto grid max-w-[var(--page-max-w)] gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:py-24">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9bc9d4]">Votre méthode de travail</p><h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Une recherche qui avance étape par étape.</h2><p className="mt-5 max-w-md text-sm leading-7 text-white/70">Un parcours simple pour transformer un ensemble de documents en informations exploitables, sans perdre la trace des sources.</p><Link href="/signup" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#172b3b] transition hover:bg-[#e8f1f2]">Créer mon espace <ArrowRight size={16}/></Link></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[{n:"01",icon:UploadCloud,t:"Collecter",d:"Ajoutez les documents et contenus utiles à votre sujet."},{n:"02",icon:Search,t:"Explorer",d:"Interrogez vos sources et identifiez les informations clés."},{n:"03",icon:Network,t:"Recouper",d:"Reliez les éléments, confrontez les points de vue et les dates."},{n:"04",icon:FileText,t:"Structurer",d:"Organisez vos conclusions dans un livrable clair et vérifiable."}].map(x=><div key={x.n} className="rounded-xl border border-white/15 bg-white/[0.06] p-5"><div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-lg bg-white/10 text-[#b9e0e4]"><x.icon size={17}/></span><span className="font-mono text-xs text-white/40">{x.n}</span></div><h3 className="mt-5 text-base font-semibold">{x.t}</h3><p className="mt-2 text-xs leading-5 text-white/65">{x.d}</p></div>)}
          </div>
        </div>
      </section>

      <section id="confiance" className="mx-auto grid max-w-[var(--page-max-w)] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-24">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Maîtrise & transparence</p><h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Gardez la main sur vos informations.</h2><p className="mt-5 max-w-xl text-sm leading-7 text-text-muted">Un bon outil de recherche doit vous aider à comprendre, mais aussi vous permettre de vérifier et de décider ce que vous partagez.</p></div>
        <div className="grid gap-4">
          <Trust icon={LockKeyhole} title="Vos espaces restent privés par défaut" desc="Le partage public est une action volontaire, contrôlée depuis vos notebooks."/>
          <Trust icon={Quote} title="Des réponses que vous pouvez vérifier" desc="Les références aux sources vous aident à retrouver le contexte des informations citées."/>
          <Trust icon={Layers3} title="Un espace organisé par sujet" desc="Séparez vos recherches dans des notebooks distincts et gardez un cadre de travail lisible."/>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:pb-28">
        <div className="mx-auto max-w-[var(--page-max-w)] overflow-hidden rounded-2xl bg-accent px-6 py-12 text-on-accent sm:px-12 sm:py-16">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-75">Prêt à commencer ?</p><h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Donnez une structure à vos recherches.</h2><p className="mt-4 max-w-xl text-sm leading-6 opacity-80">Créez votre espace, ajoutez vos premières sources et commencez à explorer ce qu’elles contiennent.</p></div>
            <Link href="/signup" className="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#123d62] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#edf5fa]">Créer mon compte <ArrowUpRight size={17}/></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-surface/55">
        <div className="mx-auto flex max-w-[var(--page-max-w)] flex-col gap-5 px-5 py-8 text-xs text-text-subtle sm:px-8 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-text"><span className="grid size-7 place-items-center rounded-lg bg-accent text-on-accent"><BookOpen size={14}/></span> Leanna Notebook</Link>
          <p>Un espace pour rechercher, comprendre et structurer vos connaissances.</p>
          <div className="flex flex-wrap gap-5"><Link href="/login" className="hover:text-text">Connexion</Link><Link href="/signup" className="hover:text-text">Créer un compte</Link><Link href="/privacy" className="hover:text-text">Confidentialité</Link><Link href="/terms" className="hover:text-text">Conditions</Link></div>
        </div>
      </footer>
    </main>
  );
}

function Feature({icon:Icon,number,title,desc,tags}:{icon:typeof BookOpen;number:string;title:string;desc:string;tags:string[]}) {
  return <article className="group rounded-2xl border border-border bg-surface-raised p-6 shadow-xs transition duration-200 hover:-translate-y-1 hover:shadow-lg"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-on-accent-soft"><Icon size={19}/></span><span className="font-mono text-[10px] text-text-subtle">{number}</span></div><h3 className="mt-6 text-base font-semibold tracking-tight">{title}</h3><p className="mt-3 min-h-[5rem] text-sm leading-6 text-text-muted">{desc}</p><div className="mt-5 flex flex-wrap gap-1.5">{tags.map(t=><span key={t} className="rounded-md bg-surface px-2 py-1 text-[10px] text-text-subtle">{t}</span>)}</div></article>;
}

function Trust({icon:Icon,title,desc}:{icon:typeof BookOpen;title:string;desc:string}) {
  return <div className="flex gap-4 rounded-xl border border-border bg-surface-raised p-5"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-on-accent-soft"><Icon size={18}/></span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-text-muted">{desc}</p></div></div>;
}

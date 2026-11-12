import Link from "next/link";
import { ArrowLeft, Check, FileSearch, LockKeyhole, Network, Sparkles } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mobile-auth-layout min-h-dvh bg-bg text-text lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
      <section className="relative hidden min-h-dvh overflow-hidden bg-[#172b3b] px-10 py-10 text-white lg:flex lg:flex-col xl:px-16">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-1/4 size-[34rem] rounded-full bg-[#5c9eb0]/20 blur-[110px]" />
          <div className="absolute -right-36 bottom-0 size-[30rem] rounded-full bg-[#d9c6a4]/15 blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(#fff 0.7px, transparent 0.7px)", backgroundSize: "19px 19px" }} />
        </div>
        <Link href="/" className="relative z-10 inline-flex w-fit items-center gap-3" aria-label="Leanna Notebook, accueil">
          <span className="grid size-12 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-sm"><img src="/logo.png" alt="" className="size-full object-contain" /></span>
          <span className="text-lg font-semibold tracking-tight">Leanna<span className="font-normal text-white/65"> Notebook</span></span>
        </Link>
        <div className="relative z-10 my-auto max-w-xl py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-white/75">
            <Sparkles size={14} className="text-[#b9e0e4]" /> Votre espace de recherche intelligent
          </div>
          <h1 className="font-serif text-5xl leading-[1.08] tracking-tight xl:text-6xl">Chaque document peut révéler <span className="text-[#b9e0e4]">une nouvelle piste.</span></h1>
          <p className="mt-6 max-w-lg text-base leading-8 text-white/65">Retrouvez vos sources, interrogez vos documents et construisez des recherches structurées sans perdre le fil des informations.</p>
          <div className="mt-12 grid gap-4">
            {[{icon:FileSearch,title:"Toutes vos sources au même endroit",desc:"PDF, pages web, notes et documents."},{icon:Network,title:"Les liens deviennent visibles",desc:"Reliez les faits, les entités et les chronologies."},{icon:LockKeyhole,title:"Vous gardez le contrôle",desc:"Vos espaces restent privés par défaut."}].map((item)=><div key={item.title} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.055] p-4"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 text-[#b9e0e4]"><item.icon size={18}/></span><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-white/55">{item.desc}</p></div><Check className="ml-auto size-4 shrink-0 text-[#9bc9a9]"/></div>)}
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between text-xs text-white/40"><span>Leanna Notebook</span><span>Rechercher · Comprendre · Structurer</span></div>
      </section>

      <section className="mobile-auth-panel relative flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:px-12 xl:px-16">
        <header className="mobile-auth-header mx-auto flex w-full max-w-[480px] items-center justify-between lg:mx-0 lg:max-w-none">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-text-muted transition hover:text-text"><ArrowLeft size={16}/> Retour à l’accueil</Link>
          <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight lg:hidden"><span className="grid size-9 place-items-center overflow-hidden rounded-lg bg-white p-1 shadow-sm"><img src="/logo.png" alt="" className="size-full object-contain"/></span> Leanna Notebook</Link>
        </header>
        <div className="mobile-auth-content mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-12 lg:mx-auto lg:max-w-[440px]">
          <div className="mb-8">
            <div className="mb-5 hidden size-14 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-sm lg:grid"><img src="/logo.png" alt="Logo Leanna Notebook" className="size-full object-contain"/></div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Leanna Notebook</p>
            <div className="mt-3">{children}</div>
          </div>
        </div>
        <footer className="mobile-auth-footer mx-auto w-full max-w-[440px] pb-2 text-center text-xs leading-6 text-text-subtle lg:mx-auto">
          En continuant, vous acceptez nos <Link className="underline underline-offset-4 hover:text-text" href="/terms">Conditions</Link> et notre <Link className="underline underline-offset-4 hover:text-text" href="/privacy">Politique de confidentialité</Link>.
          <p className="mt-2">© {new Date().getFullYear()} Leanna Notebook</p>
        </footer>
      </section>
    </main>
  );
}

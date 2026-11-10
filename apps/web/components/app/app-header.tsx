import Link from "next/link";
import { Compass, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackButton } from "./feedback-button";
import { SignOutButton } from "./signout-button";

/** En-tête commun de l'application (56 px). `children` : titre ou actions propres à la page. */
/** `notebookId` : active le signalement de ce notebook dans le formulaire d'avis. */
export function AppHeader({ children, notebookId }: { children?: React.ReactNode; notebookId?: string }) {
  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-[var(--header-h)] items-center gap-3 border-b bg-surface-raised px-3 sm:px-5">
      <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md" aria-label="Notebook, accueil">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" aria-hidden width={32} height={32} className="size-8 shrink-0 object-contain" />
        <span className="hidden font-serif text-lg sm:inline">Leanna</span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <div id="app-header-actions" className="flex shrink-0 items-center gap-1 empty:hidden" />
      <nav aria-label="Compte" className="flex shrink-0 items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/discover" aria-label="Découvrir des notebooks"><Compass aria-hidden /><span className="hidden md:inline">Découvrir</span></Link>
        </Button>
        <FeedbackButton notebookId={notebookId} />
        <Button asChild variant="ghost" size="icon" aria-label="Réglages">
          <Link href="/settings"><Settings aria-hidden /></Link>
        </Button>
        <SignOutButton />
      </nav>
    </header>
  );
}

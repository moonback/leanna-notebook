import Link from "next/link";
import { BookOpen, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackButton } from "./feedback-button";

/** En-tête commun de l'application (56 px). `children` : titre ou actions propres à la page. */
/** `notebookId` : active le signalement de ce notebook dans le formulaire d'avis. */
export function AppHeader({ children, notebookId }: { children?: React.ReactNode; notebookId?: string }) {
  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-[var(--header-h)] items-center gap-3 border-b bg-surface-raised px-3 sm:px-5">
      <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md" aria-label="Notebook, accueil">
        <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-accent text-on-accent"><BookOpen className="size-4" /></span>
        <span className="hidden font-serif text-lg sm:inline">Notebook</span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <nav aria-label="Compte" className="flex shrink-0 items-center gap-1">
        <FeedbackButton notebookId={notebookId} />
        <Button asChild variant="ghost" size="icon" aria-label="Réglages">
          <Link href="/settings"><Settings aria-hidden /></Link>
        </Button>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="icon" aria-label="Se déconnecter"><LogOut aria-hidden /></Button>
        </form>
      </nav>
    </header>
  );
}

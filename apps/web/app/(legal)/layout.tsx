import Link from "next/link";
import { BookOpen } from "lucide-react";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b bg-surface-raised">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-accent text-on-accent"><BookOpen className="size-4" /></span>
            <span className="font-serif text-lg">Leanna</span>
          </Link>
          <nav aria-label="Documents légaux" className="flex gap-4 text-sm text-text-muted">
            <Link className="hover:text-text hover:underline" href="/privacy">Confidentialité</Link>
            <Link className="hover:text-text hover:underline" href="/terms">Conditions</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}

import { BookOpen } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-accent text-on-accent">
            <BookOpen className="size-5" />
          </span>
          <span className="font-serif text-xl">Notebook</span>
        </div>
        <div className="rounded-xl border bg-surface-raised p-6 shadow-card sm:p-8">{children}</div>
      </div>
    </main>
  );
}

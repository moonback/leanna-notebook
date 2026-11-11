import * as React from "react";
import { PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";

/** Carte (notebook en grille, artefact, résultat de recherche). Cliquable = un vrai lien/bouton à l'intérieur. */
export function Card({ className, interactive, ...props }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "relative rounded-lg border bg-surface-raised shadow-xs",
        interactive && "transition-[box-shadow,border-color] duration-150 hover:border-border-strong hover:shadow-card focus-within:border-focus",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Panneau latéral de l'espace de travail (Sources, Studio).
 * Région nommée (landmark) ; repliable en rail de 56 px ; sur mobile, affiché en onglet plein écran par la page.
 */
export function Panel({
  title, actions, children, className, collapsed, onToggle, id,
}: {
  title: string; actions?: React.ReactNode; children: React.ReactNode; className?: string;
  collapsed?: boolean; onToggle?: () => void; id: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn("flex min-h-0 flex-col rounded-xl border bg-surface-raised", collapsed && "w-[var(--panel-collapsed-w)]", className)}
    >
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2">
        <h2 id={`${id}-title`} className={cn("shrink-0 text-sm font-semibold", !collapsed && "mr-auto", collapsed && "sr-only")}>{title}</h2>
        {!collapsed && actions && <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">{actions}</div>}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-controls={`${id}-body`}
            aria-label={collapsed ? `Afficher ${title}` : `Masquer ${title}`}
            className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text"
          >
            <PanelLeftClose className={cn("size-4 transition-transform", collapsed && "rotate-180")} aria-hidden />
          </button>
        )}
      </header>
      <div id={`${id}-body`} hidden={collapsed} className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

/* ----- Table (tableau de bord en liste) : <table> sémantique, en-têtes triables via aria-sort. ----- */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("h-10 border-b px-3 text-left text-xs font-medium text-text-muted", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-12 border-b px-3 align-middle", className)} {...props} />;
}
export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface", className)} {...props} />;
}

/** Ligne de liste générique (source, artefact) : icône · texte principal + méta · action. */
export function ListRow({
  icon, title, meta, trailing, selected, wrap, className, ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & { icon?: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode; trailing?: React.ReactNode; selected?: boolean; /** Autorise le titre (2 lignes) et la méta à passer à la ligne au lieu d'être tronqués. */ wrap?: boolean }) {
  return (
    <div
      className={cn("group flex min-h-11 min-w-0 items-center gap-3 rounded-md px-3 py-1.5 hover:bg-surface", wrap && "items-start", selected && "bg-accent-soft/60", className)}
      {...props}
    >
      {icon && <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-surface text-text-muted [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm text-text", wrap ? "line-clamp-2 break-words" : "truncate")}>{title}</div>
        {meta && <div className={cn("text-xs text-text-subtle", wrap ? "break-words" : "truncate")}>{meta}</div>}
      </div>
      {trailing}
    </div>
  );
}

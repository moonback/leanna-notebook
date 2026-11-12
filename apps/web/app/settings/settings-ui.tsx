import * as React from "react";
import { cn } from "@/lib/utils";

/** Section de réglages : en-tête (titre + description + action) puis corps en lignes séparées. */
export function SettingsSection({
  title, description, action, children, tone = "default", className,
}: {
  title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
  tone?: "default" | "danger"; className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border bg-surface-raised shadow-xs", tone === "danger" && "border-danger/40", className)}>
      <header className={cn("flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4", tone === "danger" ? "bg-danger-soft/50" : "bg-surface/60")}>
        <div className="min-w-0">
          <h2 className={cn("text-lg", tone === "danger" && "text-danger")}>{title}</h2>
          {description && <p className="mt-0.5 max-w-prose text-sm text-text-muted">{description}</p>}
        </div>
        {action}
      </header>
      <div className="divide-y">{children}</div>
    </section>
  );
}

/** Ligne de réglage : libellé + explication à gauche, contrôle à droite (empilé sur mobile). */
export function SettingsRow({
  label, description, htmlFor, children, className,
}: { label: string; description?: React.ReactNode; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:items-center md:gap-8", className)}>
      <div className="min-w-0">
        {htmlFor ? <label htmlFor={htmlFor} className="text-sm font-medium text-text">{label}</label> : <p className="text-sm font-medium text-text">{label}</p>}
        {description && <p className="mt-0.5 text-xs text-text-subtle">{description}</p>}
      </div>
      <div className="min-w-0 md:justify-self-end md:w-full">{children}</div>
    </div>
  );
}

/** Pied de section (actions d'enregistrement, état). */
export function SettingsFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-3 bg-surface/60 px-5 py-3", className)}>{children}</div>;
}

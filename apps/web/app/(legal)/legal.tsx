import * as React from "react";

/** Coordonnées de l'éditeur, lues dans l'environnement : rien d'inventé dans le texte juridique. */
export const LEGAL_ENTITY = process.env.NEXT_PUBLIC_LEGAL_ENTITY || "l’éditeur du service";
export const LEGAL_EMAIL = process.env.NEXT_PUBLIC_LEGAL_EMAIL || "";
export const UPDATED = "10 novembre 2026";

export function Contact() {
  return LEGAL_EMAIL
    ? <a className="text-accent underline underline-offset-4" href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>
    : <>l’adresse de contact indiquée par l’éditeur</>;
}

export function Doc({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="grid gap-6 text-[12px] leading-relaxed">
      <header className="grid gap-1">
        <h1 className="text-[1.5rem] leading-[1.8rem]">{title}</h1>
        <p className="text-sm text-text-muted">Dernière mise à jour : {UPDATED}</p>
      </header>
      {children}
    </article>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-xl">{title}</h2>
      {children}
    </section>
  );
}

export const List = ({ children }: { children: React.ReactNode }) => <ul className="grid list-disc gap-1.5 pl-5">{children}</ul>;

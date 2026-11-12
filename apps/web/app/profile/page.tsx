import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight, CalendarDays, CheckCircle2, ChevronRight, CircleUserRound,
  LockKeyhole, Mail, Palette, Settings2, ShieldCheck, Sparkles, UserRound,
} from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
import { SignOutButton } from "@/components/app/signout-button";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { createUserClient, getUser } from "@/lib/supabase/server";
import { ProfileForm } from "../profile-form";
import { PasswordForm } from "../settings/password-form";

export const metadata: Metadata = { title: "Mon profil · Leanna Notebook" };

function formatDate(value?: string | null) {
  if (!value) return "Non disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Non disponible";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function initialsFrom(value: string) {
  return value.split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "L";
}

export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/profile");

  const supabase = await createUserClient();
  const { data: profile } = await supabase.from("profiles")
    .select("display_name, output_language, theme, web_notifications, created_at")
    .eq("id", user.id).single();

  const displayName = profile?.display_name?.trim() || user.email?.split("@")[0] || "Mon compte";
  const initials = initialsFrom(displayName);
  const emailVerified = Boolean(user.email_confirmed_at);

  return (
    <div className="min-h-dvh bg-surface/40">
      <AppHeader><h1 className="truncate text-lg font-semibold">Mon profil</h1></AppHeader>
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 sm:py-9">
        <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-xs">
          <div aria-hidden className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-accent/15 via-accent/5 to-transparent" />
          <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid size-20 shrink-0 place-items-center rounded-2xl border-4 border-surface-raised bg-accent text-2xl font-semibold text-on-accent shadow-sm sm:size-24">{initials}</div>
              <div className="min-w-0 pb-1">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">Espace personnel</p>
                <h2 className="truncate text-2xl font-semibold tracking-tight">{displayName}</h2>
                <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-text-muted"><Mail size={14} className="shrink-0" /><span className="truncate">{user.email || "Aucune adresse e-mail"}</span></p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone="success">Compte actif</Badge>
                  {emailVerified
                    ? <Badge tone="accent"><span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> E-mail vérifié</span></Badge>
                    : <Badge tone="warning">E-mail à vérifier</Badge>}
                </div>
              </div>
            </div>
            <Button asChild variant="secondary" className="w-full gap-2 sm:w-auto">
              <Link href="/settings"><Settings2 size={16} /> Tous les réglages <ArrowRight size={15} /></Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 border-t border-border bg-surface/50 sm:grid-cols-3">
            <div className="flex items-center gap-3 px-5 py-4 sm:px-7"><CalendarDays size={17} className="text-text-subtle" /><div><p className="text-xs text-text-subtle">Membre depuis</p><p className="text-sm font-medium">{formatDate(profile?.created_at || user.created_at)}</p></div></div>
            <div className="flex items-center gap-3 border-t border-border px-5 py-4 sm:border-l sm:border-t-0 sm:px-7"><ShieldCheck size={17} className="text-text-subtle" /><div><p className="text-xs text-text-subtle">Sécurité du compte</p><p className="text-sm font-medium">{emailVerified ? "Adresse confirmée" : "Confirmation requise"}</p></div></div>
            <div className="flex items-center gap-3 border-t border-border px-5 py-4 sm:border-l sm:border-t-0 sm:px-7"><Sparkles size={17} className="text-text-subtle" /><div><p className="text-xs text-text-subtle">Dernière connexion</p><p className="text-sm font-medium">{formatDate(user.last_sign_in_at)}</p></div></div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
          <div className="grid min-w-0 gap-6">
            <section id="preferences" className="scroll-mt-24 rounded-2xl border border-border bg-surface-raised p-5 shadow-xs sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><CircleUserRound size={19} /></div>
                <div><h2 className="font-semibold">Informations personnelles</h2><p className="mt-1 text-sm text-text-muted">Gérez votre nom, la langue de Leanna et vos préférences d’affichage.</p></div>
              </div>
              {profile ? (
                <ProfileForm initial={{ display_name: profile.display_name, output_language: profile.output_language, theme: profile.theme as "light" | "dark" | "system", web_notifications: profile.web_notifications }} />
              ) : (
                <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">Impossible de charger vos préférences. Rechargez la page ou ouvrez les réglages.</div>
              )}
            </section>

            <section id="security" className="scroll-mt-24 rounded-2xl border border-border bg-surface-raised p-5 shadow-xs sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><LockKeyhole size={19} /></div>
                <div><h2 className="font-semibold">Mot de passe et sécurité</h2><p className="mt-1 text-sm text-text-muted">Changez votre mot de passe en confirmant d’abord l’actuel.</p></div>
              </div>
              <PasswordForm />
            </section>
          </div>

          <aside className="grid gap-3 lg:sticky lg:top-20">
            <div className="rounded-2xl border border-border bg-surface-raised p-4 shadow-xs">
              <h2 className="mb-3 text-sm font-semibold">Accès rapide</h2>
              <nav aria-label="Accès rapide au profil" className="grid gap-1">
                <a href="#preferences" className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-text-muted transition-colors hover:bg-surface hover:text-text"><span className="flex items-center gap-2"><UserRound size={16} /> Informations personnelles</span><ChevronRight size={15} /></a>
                <a href="#security" className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-text-muted transition-colors hover:bg-surface hover:text-text"><span className="flex items-center gap-2"><ShieldCheck size={16} /> Sécurité</span><ChevronRight size={15} /></a>
                <Link href="/settings" className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-text-muted transition-colors hover:bg-surface hover:text-text"><span className="flex items-center gap-2"><Palette size={16} /> Réglages avancés</span><ChevronRight size={15} /></Link>
              </nav>
            </div>
            <div className="rounded-2xl border border-border bg-surface-raised p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} className="text-accent" /> Votre compte est protégé</div>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">Ne partagez jamais votre mot de passe. Leanna vous demandera votre mot de passe actuel avant toute modification.</p>
              <Link href="/settings" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">Consulter les réglages <ArrowRight size={13} /></Link>
            </div>
            <SignOutButton labeled />
          </aside>
        </div>
      </main>
    </div>
  );
}

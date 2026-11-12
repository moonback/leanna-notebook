import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays, Mail, ShieldCheck, UserRound } from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
import { Badge } from "@/components/ui/feedback";
import { createUserClient, getUser } from "@/lib/supabase/server";
import { ProfileForm } from "../profile-form";
import { PasswordForm } from "../settings/password-form";

export const metadata: Metadata = { title: "Mon profil · Leanna Notebook" };

export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/profile");
  const supabase = await createUserClient();
  const { data: profile } = await supabase.from("profiles")
    .select("display_name, output_language, theme, web_notifications, created_at")
    .eq("id", user.id).single();
  if (!profile) redirect("/settings");

  const displayName = profile.display_name?.trim() || user.email?.split("@")[0] || "Compte";
  const initials = displayName.split(/\\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-dvh bg-surface/40">
      <AppHeader><h1 className="truncate text-lg">Mon profil</h1></AppHeader>
      <main className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:px-6">
        <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface-raised p-6 shadow-xs">
          <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-accent text-xl font-semibold text-on-accent">{initials}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold">{displayName}</h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-text-muted"><Mail size={14} /> {user.email}</p>
          </div>
          <Badge tone="success">Compte actif</Badge>
        </section>

        <section className="rounded-xl border border-border bg-surface-raised p-5">
          <div className="mb-4 flex items-center gap-2"><UserRound size={18} className="text-accent" /><h2 className="font-semibold">Informations du compte</h2></div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-surface p-3"><p className="text-xs text-text-subtle">Adresse e-mail</p><p className="mt-1 break-all font-medium">{user.email}</p></div>
            <div className="rounded-lg bg-surface p-3"><p className="flex items-center gap-1 text-xs text-text-subtle"><CalendarDays size={12} /> Membre depuis</p><p className="mt-1 font-medium">{new Date(profile.created_at).toLocaleDateString("fr-FR", { dateStyle: "long" })}</p></div>
            <div className="rounded-lg bg-surface p-3"><p className="flex items-center gap-1 text-xs text-text-subtle"><ShieldCheck size={12} /> Sécurité</p><p className="mt-1 font-medium">Authentification sécurisée</p></div>
          </div>
        </section>

        <section className="grid gap-3">
          <div><h2 className="text-lg font-semibold">Mes préférences</h2><p className="text-sm text-text-muted">Personnalisez votre nom, la langue et l'apparence de Leanna Notebook.</p></div>
          <ProfileForm initial={{ display_name: profile.display_name, output_language: profile.output_language, theme: profile.theme as "light" | "dark" | "system", web_notifications: profile.web_notifications }} />
        </section>
        <section className="grid gap-3">
          <div><h2 className="text-lg font-semibold">Sécurité du compte</h2><p className="text-sm text-text-muted">Mettez à jour votre mot de passe.</p></div>
          <PasswordForm />
        </section>
      </main>
    </div>
  );
}

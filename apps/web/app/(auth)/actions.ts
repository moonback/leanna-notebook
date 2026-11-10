"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";
import { credentialsSchema, fieldErrors, magicLinkSchema, safeNext } from "@/lib/validation";

export type AuthState = { errors?: Record<string, string>; message?: string; email?: string };

async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

// Messages Supabase traduits ; jamais le texte brut du fournisseur.
function authMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials": return "Email ou mot de passe incorrect.";
    case "email_not_confirmed": return "Confirmez d'abord votre adresse email (lien reçu par email).";
    case "user_already_exists":
    case "email_exists": return "Un compte existe déjà avec cet email. Connectez-vous.";
    case "weak_password": return "Mot de passe trop faible : mélangez lettres, chiffres et symboles.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit": return "Trop de tentatives. Réessayez dans quelques minutes.";
    default: return "Une erreur est survenue. Réessayez.";
  }
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "");
  const parsed = credentialsSchema.safeParse({ email, password: form.get("password") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), email };
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { errors: { form: authMessage(error.code) }, email };
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "");
  const parsed = credentialsSchema.safeParse({ email, password: form.get("password") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), email };
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await origin()}/auth/callback` },
  });
  if (error) return { errors: { form: authMessage(error.code) }, email };
  if (data.session) redirect("/"); // confirmation d'email désactivée (local)
  return { message: `Un email de confirmation a été envoyé à ${parsed.data.email}.`, email };
}

export async function sendMagicLink(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "");
  const parsed = magicLinkSchema.safeParse({ email });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), email };
  const supabase = await createUserClient();
  const next = safeNext(String(form.get("next") ?? ""));
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false },
  });
  // Même réponse que l'email existe ou non (pas d'énumération de comptes).
  if (error && error.status !== 400 && error.status !== 422) {
    return { errors: { form: authMessage(error.code) }, email };
  }
  return { message: `Si un compte existe pour ${parsed.data.email}, un lien de connexion vient d'être envoyé.`, email };
}

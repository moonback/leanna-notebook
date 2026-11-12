"use client";
import * as React from "react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, ArrowRight, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { signIn, signUp, sendMagicLink, type AuthState } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, {});
  const [magic, magicAction, magicPending] = useActionState<AuthState, FormData>(sendMagicLink, {});
  const [showPassword, setShowPassword] = useState(false);
  const login = mode === "login";

  return (
    <div className="grid gap-6">
      <div className="mb-1">
        <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-[2.15rem]">{login ? "Ravi de vous revoir." : "Créez votre espace."}</h1>
        <p className="mt-2 text-sm leading-6 text-text-muted">{login ? "Connectez-vous pour reprendre vos recherches exactement là où vous les avez laissées." : "Un espace pour organiser vos sources, explorer vos idées et structurer vos découvertes."}</p>
      </div>

      {state.errors?.form && <Alert tone="danger" title={state.errors.form} />}
      {state.message && <Alert tone="success" title="Vérifiez votre boîte mail">{state.message}</Alert>}
      <form action={action} className="grid gap-5" noValidate>
        <input type="hidden" name="next" value={next ?? ""} />
        <Field id="email" label="Adresse email" error={state.errors?.email}>
          <Input name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="vous@exemple.fr" className="h-11 rounded-lg"/>
        </Field>
        <div className="grid gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-text">Mot de passe</label>
          <div className="relative">
            <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={login ? "current-password" : "new-password"} required minLength={10} placeholder={login ? "Votre mot de passe" : "Choisissez un mot de passe"} aria-describedby={state.errors?.password ? "password-error" : !login ? "password-hint" : undefined} aria-invalid={state.errors?.password ? true : undefined} className="h-11 rounded-lg pr-12"/>
            <button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={showPassword} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-text-subtle transition hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-focus">{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
          </div>
          {state.errors?.password ? <p id="password-error" role="alert" className="text-xs font-medium text-danger">{state.errors.password}</p> : !login ? <p id="password-hint" className="text-xs text-text-muted">10 caractères minimum.</p> : null}
        </div>
        <Button type="submit" size="lg" loading={pending} className="mt-1 h-12 w-full rounded-lg text-sm font-semibold">{login ? "Se connecter" : "Créer mon compte"} <ArrowRight size={16}/></Button>
      </form>

      {login && (
        <div className="rounded-xl border border-border bg-surface/65 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-on-accent-soft"><WandSparkles size={17}/></span>
            <div><p className="text-sm font-semibold">Connexion sans mot de passe</p><p className="mt-1 text-xs leading-5 text-text-muted">Recevez un lien sécurisé à usage unique directement par email.</p></div>
          </div>
          {magic.errors?.form && <div className="mt-3"><Alert tone="danger" title={magic.errors.form}/></div>}
          {magic.message ? <div className="mt-3"><Alert tone="success" title="Lien envoyé">{magic.message}</Alert></div> : (
            <form action={magicAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="next" value={next ?? ""}/>
              <Field id="magic-email" label="Adresse email" error={magic.errors?.email}>
                <Input name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="vous@exemple.fr" className="h-10 rounded-lg"/>
              </Field>
              <Button type="submit" variant="secondary" loading={magicPending} className="h-10 rounded-lg">Recevoir le lien</Button>
            </form>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-text-subtle"><span className="h-px flex-1 bg-border"/><span>{login ? "Nouveau sur Leanna ?" : "Vous avez déjà un compte ?"}</span><span className="h-px flex-1 bg-border"/></div>
      <p className="text-center text-sm text-text-muted">
        <Link className="font-semibold text-accent underline-offset-4 hover:underline" href={login ? "/signup" : "/login"}>
          {login ? "Créer mon compte gratuitement" : "Se connecter à mon espace"}
        </Link>
      </p>
      {!login && <p className="text-center text-xs leading-5 text-text-subtle">En créant un compte, vous pourrez retrouver vos notebooks et vos recherches depuis tous vos appareils.</p>}
    </div>
  );
}

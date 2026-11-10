"use client";
import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { signIn, signUp, sendMagicLink, type AuthState } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, {});
  const [magic, magicAction, magicPending] = useActionState<AuthState, FormData>(sendMagicLink, {});
  const login = mode === "login";

  return (
    <div className="grid gap-6">
      {state.errors?.form && <Alert tone="danger" title={state.errors.form} />}
      {state.message && <Alert tone="success" title="Vérifiez votre boîte mail">{state.message}</Alert>}
      <form action={action} className="grid gap-4" noValidate>
        <input type="hidden" name="next" value={next ?? ""} />
        <Field id="email" label="Email" error={state.errors?.email}>
          <Input name="email" type="email" autoComplete="email" required defaultValue={state.email} />
        </Field>
        <Field
          id="password"
          label="Mot de passe"
          hint={login ? undefined : "10 caractères minimum."}
          error={state.errors?.password}
        >
          <Input name="password" type="password" autoComplete={login ? "current-password" : "new-password"} required minLength={10} />
        </Field>
        <Button type="submit" size="lg" loading={pending}>{login ? "Se connecter" : "Créer mon compte"}</Button>
      </form>

      {login && (
        <form action={magicAction} className="grid gap-3 border-t pt-6">
          <input type="hidden" name="next" value={next ?? ""} />
          <p className="text-sm text-text-muted">Sans mot de passe : recevez un lien de connexion à usage unique.</p>
          {magic.errors?.form && <Alert tone="danger" title={magic.errors.form} />}
          {magic.message ? (
            <Alert tone="success" title="Lien envoyé">{magic.message}</Alert>
          ) : (
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-56 flex-1">
                <Field id="magic-email" label="Email pour le lien" error={magic.errors?.email}>
                  <Input name="email" type="email" autoComplete="email" required />
                </Field>
              </div>
              <Button type="submit" variant="secondary" className="mt-7" loading={magicPending}>Envoyer le lien</Button>
            </div>
          )}
        </form>
      )}

      <p className="text-center text-sm text-text-muted">
        {login ? "Pas encore de compte ? " : "Déjà inscrit·e ? "}
        <Link className="font-medium text-accent underline-offset-4 hover:underline" href={login ? "/signup" : "/login"}>
          {login ? "Créer un compte" : "Se connecter"}
        </Link>
      </p>
    </div>
  );
}

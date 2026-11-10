import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Créer un compte · Notebook" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl">Créer un compte</h1>
      <p className="mb-6 text-sm text-text-muted">Gratuit, sans carte bancaire. Vos documents ne servent jamais à entraîner un modèle.</p>
      <AuthForm mode="signup" />
    </>
  );
}

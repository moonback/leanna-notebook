import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Connexion · Notebook" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-2xl">Bon retour</h1>
      <p className="mb-6 text-sm text-text-muted">Connectez-vous pour retrouver vos notebooks.</p>
      {error === "link" && (
        <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          Ce lien de connexion est invalide ou a expiré. Demandez-en un nouveau.
        </p>
      )}
      <AuthForm mode="login" next={next} />
    </>
  );
}

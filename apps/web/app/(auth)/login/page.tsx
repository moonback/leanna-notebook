import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Connexion · Leanna Notebook", description: "Connectez-vous à votre espace de recherche Leanna Notebook." };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      {error === "link" && (
        <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          Ce lien de connexion est invalide ou a expiré. Demandez-en un nouveau.
        </p>
      )}
      <AuthForm mode="login" next={next} />
    </>
  );
}

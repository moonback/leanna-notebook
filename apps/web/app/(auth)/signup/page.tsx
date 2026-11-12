import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Créer un compte · Leanna Notebook", description: "Créez votre espace personnel de recherche documentaire." };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}

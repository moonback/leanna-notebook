import Link from "next/link";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Affiché à la place de Leanna Browser pour les comptes sans abonnement Pro. */
export function ProRequired() {
  return (
    <main className="mx-auto grid max-w-md flex-1 place-content-center gap-4 px-4 py-16 text-center">
      <Globe className="mx-auto size-10 text-accent" aria-hidden />
      <h1 className="font-serif text-2xl">Leanna Browser est réservé à l’offre Pro</h1>
      <p className="text-sm text-text-muted">Passez à l’offre Pro pour naviguer sur le web avec Leanna et enregistrer des pages dans vos notebooks.</p>
      <div className="flex justify-center gap-2">
        <Button asChild><Link href="/settings">Voir les offres</Link></Button>
        <Button asChild variant="ghost"><Link href="/">Retour</Link></Button>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Contact, Doc, LEGAL_ENTITY, List, Section } from "../legal";

export const metadata: Metadata = { title: "Conditions d’utilisation · Notebook" };

export default function TermsPage() {
  return (
    <Doc title="Conditions d’utilisation">
      <p>
        Ces conditions encadrent l’utilisation de Notebook, édité par {LEGAL_ENTITY}. En créant un compte ou en utilisant le service, vous les acceptez.
      </p>

      <Section title="1. Le service">
        <p>
          Notebook vous permet d’ajouter des sources (fichiers, textes, pages web), de les interroger avec un assistant et de générer des contenus d’étude. Les réponses citent les passages des sources dont elles proviennent.
        </p>
      </Section>

      <Section title="2. Compte">
        <List>
          <li>Vous devez fournir une adresse e-mail valide et protéger vos identifiants.</li>
          <li>Vous êtes responsable de l’activité réalisée depuis votre compte.</li>
          <li>Vous pouvez supprimer votre compte à tout moment depuis Réglages ; la suppression est définitive.</li>
        </List>
      </Section>

      <Section title="3. Vos contenus">
        <p>
          Vous restez titulaire de vos sources et des contenus générés à partir d’elles. Vous nous accordez uniquement le droit de les héberger et de les traiter pour fournir le service, y compris de les transmettre à nos sous-traitants d’IA décrits dans la <Link className="text-accent underline underline-offset-4" href="/privacy">politique de confidentialité</Link>. Nous n’entraînons pas de modèles sur vos contenus.
        </p>
        <p>Vous garantissez détenir les droits nécessaires sur les documents que vous ajoutez.</p>
      </Section>

      <Section title="4. Usages interdits">
        <List>
          <li>Ajouter des contenus illicites ou portant atteinte aux droits de tiers.</li>
          <li>Tenter de contourner les quotas, la sécurité ou l’isolation entre comptes.</li>
          <li>Perturber le service, l’automatiser de façon abusive ou en extraire des données en masse.</li>
          <li>Utiliser le service pour harceler, tromper ou porter atteinte à autrui.</li>
        </List>
        <p>Nous pouvons suspendre ou supprimer un compte en cas de manquement grave.</p>
      </Section>

      <Section title="5. Réponses de l’IA">
        <p>
          Les contenus générés par IA peuvent être inexacts ou incomplets, même lorsqu’ils citent des sources. Vérifiez les informations importantes dans les documents d’origine. Ils ne constituent pas un conseil médical, juridique ou financier.
        </p>
      </Section>

      <Section title="6. Offres et quotas">
        <p>
          Chaque offre fixe des limites d’usage (par jour et par mois), visibles dans Réglages. Le paiement est actuellement simulé : aucun prélèvement n’est effectué. Les conditions de facturation seront précisées avant toute activation de paiements réels.
        </p>
      </Section>

      <Section title="7. Disponibilité et responsabilité">
        <p>
          Nous faisons au mieux pour maintenir le service, sans garantie de disponibilité continue. Dans la limite permise par la loi, notre responsabilité est limitée aux dommages directs ; elle n’est pas exclue en cas de faute lourde ou dolosive, ni pour ce que la loi interdit d’exclure. Les droits impératifs des consommateurs restent applicables.
        </p>
      </Section>

      <Section title="8. Modifications">
        <p>Nous pouvons modifier ces conditions ; en cas de changement important, nous vous en informerons dans le service. Continuer à l’utiliser vaut acceptation.</p>
      </Section>

      <Section title="9. Droit applicable et contact">
        <p>
          Ces conditions sont régies par le droit français. Pour toute question : <Contact />.
        </p>
      </Section>
    </Doc>
  );
}

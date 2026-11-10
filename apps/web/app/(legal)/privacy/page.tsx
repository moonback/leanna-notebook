import type { Metadata } from "next";
import { Contact, Doc, LEGAL_ENTITY, List, Section } from "../legal";

export const metadata: Metadata = { title: "Politique de confidentialité · Notebook" };

export default function PrivacyPage() {
  return (
    <Doc title="Politique de confidentialité">
      <p>
        Cette politique explique quelles données {LEGAL_ENTITY} (« nous ») traite lorsque vous utilisez Notebook, pourquoi, et quels sont vos droits au titre du RGPD.
      </p>

      <Section title="1. Données que nous traitons">
        <List>
          <li><strong>Compte</strong> : adresse e-mail, mot de passe (stocké sous forme hachée par notre fournisseur d’authentification), nom affiché facultatif, préférences (langue, apparence, notifications).</li>
          <li><strong>Contenus que vous ajoutez</strong> : fichiers, textes collés, adresses web, notes, ainsi que le texte extrait et découpé à partir de ces sources.</li>
          <li><strong>Contenus générés</strong> : conversations avec l’assistant, rapports, fiches, quiz, cartes mentales et autres artefacts.</li>
          <li><strong>Partage</strong> : adresses e-mail des personnes invitées et leur rôle.</li>
          <li><strong>Usage</strong> : registre de consommation (fonctionnalité utilisée, date) pour appliquer les quotas de votre offre, et journal d’audit des actions sensibles (partage, suppression).</li>
          <li><strong>Retours</strong> : messages que vous nous envoyez via le formulaire d’avis.</li>
        </List>
      </Section>

      <Section title="2. Finalités et bases légales">
        <List>
          <li>Fournir le service, c’est-à-dire créer votre compte, indexer vos sources et répondre à vos questions : exécution du contrat.</li>
          <li>Appliquer les quotas, prévenir les abus et sécuriser le service : intérêt légitime.</li>
          <li>Répondre à vos demandes et améliorer le produit à partir des retours que vous envoyez : intérêt légitime.</li>
          <li>Respecter nos obligations légales.</li>
        </List>
      </Section>

      <Section title="3. Intelligence artificielle">
        <p>
          Pour répondre, les extraits pertinents de vos sources et votre question sont envoyés à un fournisseur de modèles d’IA (via OpenRouter, qui achemine la requête vers le modèle configuré) ; un modèle d’embeddings sert à la recherche dans vos sources. Ces traitements peuvent avoir lieu hors de l’Union européenne.
        </p>
        <p>Nous n’utilisons pas vos contenus pour entraîner des modèles et nous n’envoyons à ces fournisseurs que ce qui est nécessaire à la requête.</p>
      </Section>

      <Section title="4. Hébergement et sous-traitants">
        <List>
          <li><strong>Supabase</strong> : base de données, authentification et stockage des fichiers (région UE).</li>
          <li><strong>OpenRouter et le fournisseur de modèle choisi</strong> : génération de réponses et embeddings.</li>
          <li>Un hébergeur pour l’application web et le worker de traitement asynchrone.</li>
        </List>
        <p>Les paiements sont actuellement simulés : aucune donnée bancaire n’est collectée.</p>
      </Section>

      <Section title="5. Cookies">
        <p>
          Nous utilisons uniquement des cookies strictement nécessaires : ils maintiennent votre session. Nous n’utilisons ni cookie publicitaire ni outil de mesure d’audience tiers, ce qui rend un bandeau de consentement inutile.
        </p>
      </Section>

      <Section title="6. Partage avec d’autres utilisateurs">
        <p>
          Un notebook que vous partagez est visible, selon le rôle accordé, par les personnes invitées, y compris votre nom affiché. Si vous supprimez votre compte, vos notebooks disparaissent aussi pour elles.
        </p>
      </Section>

      <Section title="7. Durée de conservation">
        <p>
          Vos données sont conservées tant que votre compte existe. Vous pouvez supprimer un notebook ou une source à tout moment. La suppression du compte efface vos données et vos fichiers ; des copies techniques peuvent subsister dans les sauvegardes de nos fournisseurs pendant une durée limitée avant leur expiration.
        </p>
      </Section>

      <Section title="8. Vos droits">
        <p>
          Vous disposez des droits d’accès, de rectification, d’effacement, d’opposition, de limitation et de portabilité. Vous pouvez modifier vos préférences et <strong>supprimer définitivement votre compte</strong> depuis Réglages. Pour les autres demandes, écrivez à <Contact />.
        </p>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir l’autorité de contrôle de votre pays, en France la CNIL (cnil.fr).
        </p>
      </Section>

      <Section title="9. Sécurité">
        <p>
          Les fichiers sont stockés dans des espaces privés, accessibles uniquement par des liens signés de courte durée. L’accès aux données est cloisonné par compte au niveau de la base. Les échanges sont chiffrés en transit.
        </p>
      </Section>

      <Section title="10. Modifications">
        <p>Nous pouvons mettre à jour cette politique ; la date en haut de page indique la dernière version.</p>
      </Section>
    </Doc>
  );
}

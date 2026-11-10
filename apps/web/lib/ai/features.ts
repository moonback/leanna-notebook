export const AI_FEATURES = [
  { id: "chat", label: "Assistant conversationnel", description: "Réponses dans les conversations et recherche dans les sources." },
  { id: "report", label: "Rapports", description: "Rédaction des rapports dans Studio." },
  { id: "flashcards", label: "Fiches de révision", description: "Création des cartes question / réponse." },
  { id: "quiz", label: "Quiz", description: "Génération des questionnaires." },
  { id: "mind_map", label: "Cartes mentales", description: "Structuration visuelle des idées." },
  { id: "audio_overview", label: "Script Audio Overview", description: "Écriture du dialogue avant synthèse vocale." },
  { id: "embeddings", label: "Recherche vectorielle", description: "Vectorisation des questions pour la recherche sémantique." },
] as const;
export type AiFeatureKey = typeof AI_FEATURES[number]["id"];

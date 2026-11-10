export const AI_FEATURES = [
  { id: "chat", label: "Assistant conversationnel", description: "Réponses dans les conversations et recherche dans les sources.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "report", label: "Rapports", description: "Rédaction des rapports dans Studio.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "flashcards", label: "Fiches de révision", description: "Création des cartes question / réponse.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "quiz", label: "Quiz", description: "Génération des questionnaires.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "mind_map", label: "Cartes mentales", description: "Structuration visuelle des idées.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "audio_overview", label: "Script Audio Overview", description: "Écriture du dialogue avant synthèse vocale.", inputModalities: ["text"], outputModalities: ["text"] },
] as const;
export type AiFeatureKey = typeof AI_FEATURES[number]["id"];

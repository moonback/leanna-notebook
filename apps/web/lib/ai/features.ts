export const AI_FEATURES = [
  { id: "chat", label: "Assistant conversationnel", description: "Réponses dans les conversations et recherche dans les sources.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "report", label: "Rapports", description: "Rédaction des rapports dans Studio.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "flashcards", label: "Fiches de révision", description: "Création des cartes question / réponse.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "quiz", label: "Quiz", description: "Génération des questionnaires.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "mind_map", label: "Cartes mentales", description: "Structuration visuelle des idées.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "audio_overview", label: "Script Audio Overview", description: "Écriture du dialogue avant synthèse vocale.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "deep_research", label: "Recherche approfondie", description: "Planification, analyse des pages et vérification croisée (le rapport utilise le modèle « Rapports »).", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "knowledge_extraction", label: "Graphe de connaissances", description: "Extraction des entités, relations et affirmations des sources.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "prompt_suggestions", label: "Suggestions de consignes", description: "Les 3 idées de consignes proposées dans les fenêtres du Studio.", inputModalities: ["text"], outputModalities: ["text"] },
  { id: "contradictions", label: "Contradictions", description: "Qualification des écarts détectés entre sources.", inputModalities: ["text"], outputModalities: ["text"] },
] as const;
export type AiFeatureKey = typeof AI_FEATURES[number]["id"];

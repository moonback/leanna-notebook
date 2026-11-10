# Catalogue des prompts IA

## Inventaire
L'inventaire exhaustif des prompts ne peut pas être établi sans parcourir le code applicatif. Aucun identifiant ni chemin source n'est inventé ici.

| Famille | Usage identifié | Point d'intégration à confirmer |
|---|---|---|
| Chat/RAG | Réponses sur passages sélectionnés | Handler chat / client OpenRouter |
| Résumé notebook | Synthèse du corpus | Worker |
| Guide de source | Résumé et thèmes clés | Worker |
| Studio | Rapports, quiz, fiches, carte mentale | Générateurs worker |
| Audio Overview | Script dialogué | Pipeline audio worker |
| Extraction | Normalisation de documents | Ingestion |
| Recherche web | Synthèse Fast Research | Worker Tavily |
| Vocal | Conversation Live et recherche RAG | Routes voice-token / voice-search |

Pour chaque prompt à inventorier : identifiant, nom, fichiers, fonction d'assemblage, variables dynamiques, format attendu, modèle, tests, possibilité d'override et protections contre les instructions contenues dans les sources.

Maintenir une séparation stricte entre règles système de sécurité et préférences utilisateur. Ne jamais exposer les règles de sécurité à un éditeur de prompts utilisateur.
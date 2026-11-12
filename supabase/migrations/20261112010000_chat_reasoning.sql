-- Trace de réflexion (reasoning tokens) du modèle, affichée en repliable avant la réponse.
-- Texte libre, jamais cité : aucune citation n'y pointe.
alter table public.chat_messages add column thoughts text;

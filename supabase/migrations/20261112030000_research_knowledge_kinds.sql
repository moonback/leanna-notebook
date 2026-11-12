-- Deep Research & Knowledge Graph : nouveaux types de jobs.
-- Fichier séparé : une valeur d'enum ajoutée ne peut pas être utilisée dans la même transaction.
alter type public.job_kind add value if not exists 'deep_research';
alter type public.job_kind add value if not exists 'knowledge_extract';
alter type public.job_kind add value if not exists 'knowledge_contradictions';

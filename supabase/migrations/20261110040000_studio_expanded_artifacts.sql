-- Studio étendu : nouveaux artefacts textuels sourcés.
-- Les types audio/vidéo/infographie historiques restent inchangés.
alter type public.artifact_type add value if not exists 'timeline';
alter type public.artifact_type add value if not exists 'comparison';
alter type public.artifact_type add value if not exists 'glossary';
alter type public.artifact_type add value if not exists 'faq';
alter type public.artifact_type add value if not exists 'diagram';
alter type public.artifact_type add value if not exists 'editorial';
alter type public.artifact_type add value if not exists 'study_plan';

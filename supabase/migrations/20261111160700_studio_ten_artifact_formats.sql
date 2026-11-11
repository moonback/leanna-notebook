-- Dix nouveaux formats documentaires du Studio Leanna Notebook.
-- Les sorties restent des artefacts textuels sourcés et utilisent le pipeline existant.
alter type public.artifact_type add value if not exists 'one_pager';
alter type public.artifact_type add value if not exists 'swot';
alter type public.artifact_type add value if not exists 'decision_tree';
alter type public.artifact_type add value if not exists 'memo';
alter type public.artifact_type add value if not exists 'raci';
alter type public.artifact_type add value if not exists 'case_study';
alter type public.artifact_type add value if not exists 'literature_review';
alter type public.artifact_type add value if not exists 'presentation_script';
alter type public.artifact_type add value if not exists 'roadmap';
alter type public.artifact_type add value if not exists 'troubleshooting';

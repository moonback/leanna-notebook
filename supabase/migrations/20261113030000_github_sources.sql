-- Dépôts GitHub publics importés comme source (une source = un dépôt, une « page » = un fichier).
-- external_ref.github = {owner, repo, ref, commit, files[], skipped, truncated} ; files[i] = chemin de la page i+1.
alter type public.source_kind add value if not exists 'github';

-- Deep Research & Knowledge Graph : création atomique, étapes, reprise, résolution d'entités,
-- élagage à la suppression d'une source, persistance des décisions humaines, isolation RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'kg-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b7', 'kg-stranger@test.local');
insert into public.notebooks (id, workspace_id, created_by, title)
select '78787878-7878-7878-7878-787878787871', id, owner_id, 'Graphe'
  from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000a7';
insert into public.sources (id, workspace_id, notebook_id, kind, title, status)
select s.id::uuid, n.workspace_id, n.id, 'text', s.title, 'ready'
  from public.notebooks n, (values ('78787878-0000-0000-0000-0000000000a1', 'Rapport A'), ('78787878-0000-0000-0000-0000000000a2', 'Article B')) s(id, title)
 where n.id = '78787878-7878-7878-7878-787878787871';

set local role service_role;

-- ------------------------------------------------------------ Deep Research
create temp table _run as select public.create_deep_research('78787878-7878-7878-7878-787878787871',
  '00000000-0000-0000-0000-0000000000a7', 'Stockage d''énergie', 'deep', 10, 'structured', 'sources récentes', null, 'dr-idem-1') as id;
grant all on _run to public;
select is((select count(*)::int from public.jobs where target_id = (select id from _run) and kind = 'deep_research' and status = 'queued' and payload ->> 'step' = 'plan'), 1,
  'la création programme l''étape de planification');
select is((select u.status::text from public.research_runs r join public.usage_ledger u on u.id = r.usage_id where r.id = (select id from _run)), 'reserved',
  'le crédit est réservé dans la même transaction');
select is(public.create_deep_research('78787878-7878-7878-7878-787878787871', '00000000-0000-0000-0000-0000000000a7',
  'Stockage d''énergie', 'deep', 10, 'structured', null, null, 'dr-idem-1'), (select id from _run), 'idempotence : même recherche, pas de double crédit');
select throws_ok($$ select public.create_deep_research('78787878-7878-7878-7878-787878787871', '00000000-0000-0000-0000-0000000000a7', 'Sujet', 'ultra', 10, 'structured') $$,
  '22023', null, 'profondeur inconnue refusée');

update public.research_runs set pause_requested = true where id = (select id from _run);
select is(public.research_enqueue_step((select id from _run), 'iterate'), null, 'pause : aucune étape suivante programmée');
select is((select status || '/' || next_step from public.research_runs where id = (select id from _run)), 'paused/iterate', 'pause : étape conservée pour la reprise');
update public.jobs set status = 'succeeded' where target_id = (select id from _run);
select isnt(public.resume_deep_research((select id from _run), '00000000-0000-0000-0000-0000000000a7'), null, 'reprise : nouvelle étape programmée');
select is((select count(*)::int from public.jobs where target_id = (select id from _run) and status = 'queued' and payload ->> 'step' = 'iterate'), 1,
  'la reprise repart de l''étape enregistrée');

-- bail expiré au dernier essai : la recherche passe en échec visible et le crédit est rendu
update public.jobs set status = 'running', attempts = max_attempts, locked_until = now() - interval '1 minute'
 where target_id = (select id from _run) and status = 'queued';
do $$ begin perform public.requeue_stale_jobs(); end $$;
select is((select status || '/' || error_code from public.research_runs where id = (select id from _run)), 'failed/lease_expired', 'worker mort : recherche en échec');
select is((select u.status::text from public.research_runs r join public.usage_ledger u on u.id = r.usage_id where r.id = (select id from _run)), 'refunded', 'worker mort : crédit rendu');

update public.research_runs set cancel_requested = true, status = 'cancelled' where id = (select id from _run);
select is(public.research_enqueue_step((select id from _run), 'write'), null, 'annulée : plus aucune étape');

-- --------------------------------------------------------- Knowledge Graph
do $$ begin
  perform public.replace_source_knowledge('78787878-0000-0000-0000-0000000000a1', $j${
    "entities": [
      {"key":"openai","type":"company","type_group":"org","name":"OpenAI","aliases":[],"mentions":[{"surface":"OpenAI","quote":"OpenAI a lancé le projet.","char_start":0,"char_end":25}]},
      {"key":"sam altman","type":"person","type_group":"person","name":"Sam Altman","aliases":[],"mentions":[{"surface":"Sam Altman","quote":"Sam Altman dirige OpenAI.","char_start":30,"char_end":55}]}],
    "relations": [{"source_key":"sam altman","source_group":"person","target_key":"openai","target_group":"org","type":"leads","assertion":"explicit","confidence":0.9,
      "evidence":[{"quote":"Sam Altman dirige OpenAI.","char_start":30,"char_end":55}]}],
    "claims": [{"subject_key":"openai","subject_group":"org","attribute":"launch_date","attribute_label":"lancement","value_text":"mars 2024","value_type":"date",
      "value_norm":{"iso":"2024-03","precision":"month"},"confidence":0.9,"quote":"lancé en mars 2024","char_start":60,"char_end":78}]}$j$::jsonb, 'test-model');
  perform public.replace_source_knowledge('78787878-0000-0000-0000-0000000000a2', $j${
    "entities": [{"key":"openai","type":"organization","type_group":"org","name":"Open AI","aliases":[{"alias":"l'entreprise OpenAI","normalized":"openai"}],
      "mentions":[{"surface":"Open AI","quote":"Open AI a lancé le projet en septembre.","char_start":0,"char_end":39}]}],
    "relations": [],
    "claims": [{"subject_key":"openai","subject_group":"org","attribute":"launch_date","attribute_label":"lancement","value_text":"septembre 2024","value_type":"date",
      "value_norm":{"iso":"2024-09","precision":"month"},"confidence":0.9,"quote":"lancé le projet en septembre","char_start":8,"char_end":36}]}$j$::jsonb, 'test-model');
end $$;

select is((select count(*)::int from public.knowledge_entities where notebook_id = '78787878-7878-7878-7878-787878787871' and normalized_key = 'openai'), 1,
  'résolution : « OpenAI » et « Open AI » forment une seule entité');
select is((select source_count from public.knowledge_entities where notebook_id = '78787878-7878-7878-7878-787878787871' and normalized_key = 'openai'), 2,
  'provenance : l''entité est justifiée par deux sources');
select is((select evidence_count from public.knowledge_relations where notebook_id = '78787878-7878-7878-7878-787878787871' and type = 'leads'), 1,
  'la relation conserve son passage justificatif');

do $$ begin
  perform public.replace_contradictions('78787878-7878-7878-7878-787878787871', jsonb_build_array(jsonb_build_object(
    'fingerprint', 'fp-launch',
    'subject_entity_id', (select id from public.knowledge_entities where normalized_key = 'openai' and notebook_id = '78787878-7878-7878-7878-787878787871'),
    'attribute', 'launch_date', 'category', 'date', 'kind', 'direct',
    'claim_a_id', (select id from public.knowledge_claims where source_id = '78787878-0000-0000-0000-0000000000a1'),
    'claim_b_id', (select id from public.knowledge_claims where source_id = '78787878-0000-0000-0000-0000000000a2'),
    'explanation', 'mars 2024 / septembre 2024', 'confidence', 0.85, 'detector', '{}'::jsonb)));
end $$;
select is(public.review_contradiction((select id from public.knowledge_contradictions where fingerprint = 'fp-launch'), '00000000-0000-0000-0000-0000000000a7', 'confirm', 'vérifié'),
  'confirmed', 'décision humaine enregistrée');
do $$ begin perform public.replace_contradictions('78787878-7878-7878-7878-787878787871', '[]'::jsonb); end $$;
select is((select status from public.knowledge_contradictions where fingerprint = 'fp-launch'), 'confirmed', 'un cas revu n''est jamais supprimé par une nouvelle analyse');
select is((select count(*)::int from public.contradiction_reviews where fingerprint = 'fp-launch'), 1, 'historique des décisions conservé');

-- ------------------------------------------------------------- isolation
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000b7', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.research_runs) + (select count(*)::int from public.knowledge_entities)
        + (select count(*)::int from public.knowledge_claims) + (select count(*)::int from public.knowledge_contradictions), 0,
  'isolation : un autre compte ne voit ni recherches ni graphe');
select throws_ok($$ select public.knowledge_graph('78787878-7878-7878-7878-787878787871') $$, '42501', null, 'le graphe complet est réservé au serveur');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a7', 'role', 'authenticated')::text, true);
set local role authenticated;
select ok((select count(*) from public.knowledge_entities) >= 2, 'le propriétaire lit son graphe sous RLS');
reset role;

-- ------------------------------------------------- suppression des sources
set local role service_role;
delete from public.sources where id = '78787878-0000-0000-0000-0000000000a2';
select is((select source_count from public.knowledge_entities where normalized_key = 'openai' and notebook_id = '78787878-7878-7878-7878-787878787871'), 1,
  'suppression : l''entité encore justifiée par une autre source est conservée');
delete from public.sources where id = '78787878-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.knowledge_entities where notebook_id = '78787878-7878-7878-7878-787878787871'), 0,
  'suppression : plus aucune entité sans provenance');
reset role;

select * from finish();
rollback;

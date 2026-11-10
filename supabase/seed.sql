-- Données de base (plans). Les plans payants sont fixés par /replica-launch.
insert into public.plans (id, name, price_cents, currency, billing_interval, limits) values
  ('free', 'Gratuit', 0, 'EUR', 'none',
   '{"monthly_credits":300,"max_notebooks":50,"max_sources_per_notebook":50,"max_members_per_notebook":5,
     "daily":{"chat":50,"report":10,"flashcards":10,"quiz":10,"mind_map":10,"audio":2,"research":3},
     "credit_cost":{"chat":1,"report":5,"flashcards":5,"quiz":5,"mind_map":3,"data_table":5,
                    "audio":30,"slide_deck":30,"infographic":20,"video":80,"research":10,"deep_research":40}}');
-- Les plans payants (montants, stripe_price_id) sont fixés par /replica-launch.

-- Plan payant de démonstration (facturation SIMULÉE tant que Stripe n'est pas branché ; prix à fixer par /replica-launch)
insert into public.plans (id, name, price_cents, currency, billing_interval, limits) values
  ('pro', 'Pro', 1200, 'EUR', 'month',
   '{"monthly_credits":3000,"max_notebooks":500,"max_sources_per_notebook":300,"max_members_per_notebook":50,
     "daily":{"chat":500,"report":100,"flashcards":100,"quiz":100,"mind_map":100,"audio":20,"research":20},
     "credit_cost":{"chat":1,"report":5,"flashcards":5,"quiz":5,"mind_map":3,"data_table":5,
                    "audio":30,"slide_deck":30,"infographic":20,"video":80,"research":10,"deep_research":40}}')
on conflict (id) do nothing;

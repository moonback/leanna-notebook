-- Prix interne dédié aux images IA (distinct du coût fournisseur OpenRouter en USD).
update public.plans
set limits = jsonb_set(
  jsonb_set(coalesce(limits, '{}'::jsonb), '{credit_cost,image}', '5'::jsonb, true),
  '{daily,image}', '10'::jsonb, true
);

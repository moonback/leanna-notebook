-- Prix interne dédié aux images IA (distinct du coût fournisseur OpenRouter en USD).
update public.plans
set limits = jsonb_set(
  jsonb_set(
    coalesce(limits, '{}'::jsonb),
    '{credit_cost}',
    coalesce(limits -> 'credit_cost', '{}'::jsonb) || '{"image":5}'::jsonb,
    true
  ),
  '{daily}',
  coalesce(limits -> 'daily', '{}'::jsonb) || '{"image":10}'::jsonb,
  true
);

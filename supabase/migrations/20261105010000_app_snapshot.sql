-- Everything the app needs for a month in one round trip (it used to take seven queries in two waves).
-- security invoker: row level security still applies, and every subquery also filters on the caller for index use.
-- Transactions: from a week before the plan (its partial first week) or four weeks back (pattern detection),
-- whichever is earlier, plus every pending one. Returned as one jsonb value, so PostgREST's max-rows cap doesn't apply.
create function public.app_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  latest as (
    select mp.* from public.month_plans mp, me where mp.user_id = me.id order by mp.month desc limit 1
  ),
  since as (
    select least(coalesce((select balance_at - interval '8 days' from latest), 'infinity'), now() - interval '29 days') as t
  )
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p, me where p.id = me.id),
    'plan', (select to_jsonb(l) from latest l),
    'envelopes', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.position, e.created_at) from public.envelopes e, me where e.user_id = me.id
    ), '[]'::jsonb),
    'commitments', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at) from public.commitments c, me where c.user_id = me.id
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.occurred_at)
      from public.transactions t, me, since
      where t.user_id = me.id and (t.status = 'pending' or t.occurred_at >= since.t)
    ), '[]'::jsonb),
    'merchant_memory', coalesce((
      select jsonb_agg(to_jsonb(m)) from public.merchant_memory m, me where m.user_id = me.id
    ), '[]'::jsonb),
    'reconcile_checks', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.date desc)
      from (select rc.* from public.reconcile_checks rc, me where rc.user_id = me.id order by rc.date desc limit 60) r
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.app_snapshot() from public, anon;
grant execute on function public.app_snapshot() to authenticated;

-- Several bank accounts. Budgets and the month-end target stay on the total across accounts; accounts say where
-- money sits. The first account (by position) is the main one: payments without an account belong to it, and its
-- starting balance is the plan's bank total less the others, so the total and the accounts can never disagree.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index accounts_user_idx on public.accounts (user_id, position);
alter table public.accounts enable row level security;
create policy "Own accounts" on public.accounts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.accounts from anon;

-- Which account a bank payment used (null → the main account), and for a move between accounts, where it went.
-- Deleting an account hands its history to the main account.
alter table public.transactions
  add column account_id uuid,
  add column to_account_id uuid,
  add foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id),
  add foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete set null (to_account_id),
  add check (to_account_id is null or (kind = 'transfer' and wallet = 'bank'));
create index transactions_account_idx on public.transactions (account_id, user_id) where account_id is not null;
create index transactions_to_account_idx on public.transactions (to_account_id, user_id) where to_account_id is not null;

-- Starting balance of each account other than the main one (account id → minor units).
alter table public.month_plans
  add column opening_accounts jsonb not null default '{}'::jsonb check (jsonb_typeof(opening_accounts) = 'object');

-- The month snapshot now includes accounts.
create or replace function public.app_snapshot()
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
    'accounts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.position, a.created_at) from public.accounts a, me where a.user_id = me.id
    ), '[]'::jsonb),
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.accounts;
  end if;
end;
$$;

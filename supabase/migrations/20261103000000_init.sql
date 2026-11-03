-- Spency schema.
-- Money columns are bigint minor units (cents, paise, yen) of the owner's profile currency.
-- Every table is owner-only through row level security; anon gets nothing.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  locale text not null default 'en-US' check (char_length(locale) between 2 and 35),
  time_zone text not null default 'UTC' check (char_length(time_zone) between 1 and 64),
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  created_at timestamptz not null default now()
);

create table public.month_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  opening_bank bigint not null,
  opening_cash bigint not null default 0 check (opening_cash >= 0),
  balance_at timestamptz not null,
  target bigint not null,
  salary_amount bigint check (salary_amount > 0),
  salary_date date,
  week_start smallint not null default 1 check (week_start between 0 and 6),
  created_at timestamptz not null default now(),
  unique (user_id, month),
  check ((salary_amount is null) = (salary_date is null))
);

create table public.envelopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  weekly_limit bigint not null check (weekly_limit >= 0),
  locked boolean not null default false,
  leftover text not null default 'rollover' check (leftover in ('rollover', 'to_flex', 'to_target')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- Target for composite foreign keys, so rows can only point at their owner's envelopes.
  unique (id, user_id)
);

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  amount bigint not null check (amount > 0),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  next_debit date not null,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  wallet text not null check (wallet in ('bank', 'cash')),
  amount bigint not null check (amount > 0),
  direction text not null check (direction in ('debit', 'credit')),
  kind text not null default 'expense' check (kind in ('expense', 'income', 'salary', 'transfer', 'adjustment')),
  merchant text not null default '' check (char_length(merchant) <= 120),
  envelope_id uuid,
  commitment_id uuid,
  occurred_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'claude', 'import')),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'rejected')),
  upi_ref text check (char_length(upi_ref) between 1 and 64),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  -- Deleting an envelope or bill moves its history to flex instead of losing it.
  foreign key (envelope_id, user_id) references public.envelopes (id, user_id) on delete set null (envelope_id),
  foreign key (commitment_id, user_id) references public.commitments (id, user_id) on delete set null (commitment_id)
);

-- A payment reference can only be live once per user; a dismissed one can come back.
create unique index transactions_user_upi_ref_key on public.transactions (user_id, upi_ref)
  where upi_ref is not null and status <> 'rejected';
create index transactions_user_occurred_idx on public.transactions (user_id, occurred_at desc);

create table public.merchant_memory (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant text not null check (char_length(merchant) between 1 and 120),
  envelope_id uuid,
  primary key (user_id, merchant),
  foreign key (envelope_id, user_id) references public.envelopes (id, user_id) on delete set null (envelope_id)
);

create table public.reconcile_checks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  computed bigint not null,
  actual bigint not null,
  resolution text not null check (resolution in ('matched', 'adjusted', 'ignored')),
  primary key (user_id, date)
);

create index envelopes_user_idx on public.envelopes (user_id, position);
create index commitments_user_idx on public.commitments (user_id);

-- Row level security: each user sees and changes only their own rows.
alter table public.profiles enable row level security;
alter table public.month_plans enable row level security;
alter table public.envelopes enable row level security;
alter table public.commitments enable row level security;
alter table public.transactions enable row level security;
alter table public.merchant_memory enable row level security;
alter table public.reconcile_checks enable row level security;

-- Profiles are created by the signup trigger and removed with the auth user.
create policy "Read own profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Own plans" on public.month_plans for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own envelopes" on public.envelopes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own commitments" on public.commitments for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own transactions" on public.transactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own merchant memory" on public.merchant_memory for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own reconcile checks" on public.reconcile_checks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on all tables in schema public from anon;

-- New account → profile seeded from signup metadata, falling back to safe defaults on anything malformed.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, display_name, currency, locale, time_zone)
  values (
    new.id,
    left(coalesce(meta ->> 'display_name', ''), 80),
    case when meta ->> 'currency' ~ '^[A-Z]{3}$' then meta ->> 'currency' else 'USD' end,
    case when char_length(meta ->> 'locale') between 2 and 35 then meta ->> 'locale' else 'en-US' end,
    case when char_length(meta ->> 'time_zone') between 1 and 64 then meta ->> 'time_zone' else 'UTC' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

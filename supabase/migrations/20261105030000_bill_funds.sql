-- Yearly bills are saved for month by month. Per bill id (text key → minor units): what was already put aside
-- when this plan started. Inside opening_bank, but not spendable.
alter table public.month_plans
  add column bill_funds jsonb not null default '{}'::jsonb check (jsonb_typeof(bill_funds) = 'object');

-- A deleted bill frees its savings and leaves the not-paid-yet list.
create or replace function public.forget_unpaid_bill()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.month_plans
    set unpaid_bills = array_remove(unpaid_bills, old.id),
        bill_funds = bill_funds - old.id::text
    where user_id = old.user_id and (old.id = any (unpaid_bills) or bill_funds ? old.id::text);
  return old;
end;
$$;

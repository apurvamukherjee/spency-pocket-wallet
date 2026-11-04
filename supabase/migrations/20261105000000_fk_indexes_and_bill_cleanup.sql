-- Indexes behind the foreign keys that use "on delete set null": without them, deleting an envelope or bill
-- scans every transaction and merchant mapping in the table.
create index transactions_envelope_idx on public.transactions (envelope_id, user_id) where envelope_id is not null;
create index transactions_commitment_idx on public.transactions (commitment_id, user_id) where commitment_id is not null;
create index merchant_memory_envelope_idx on public.merchant_memory (envelope_id, user_id) where envelope_id is not null;
create index profiles_default_envelope_idx on public.profiles (default_envelope_id, id) where default_envelope_id is not null;

-- unpaid_bills is a plain uuid[] (arrays can't carry foreign keys), so a deleted bill would linger there forever.
-- Runs as the deleting user, so row level security still limits it to their own plans.
create function public.forget_unpaid_bill()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.month_plans
    set unpaid_bills = array_remove(unpaid_bills, old.id)
    where user_id = old.user_id and old.id = any (unpaid_bills);
  return old;
end;
$$;

create trigger on_commitment_deleted
  after delete on public.commitments
  for each row execute function public.forget_unpaid_bill();

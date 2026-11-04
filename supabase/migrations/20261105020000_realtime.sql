-- Lets the app hear about rows changed elsewhere (payments Claude adds over MCP, edits in another tab) through
-- Supabase Realtime. Row level security decides which changes each subscriber receives.
-- Guarded so the migration also runs on Postgres without Supabase's publication (local tests).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.transactions, public.envelopes, public.commitments, public.month_plans;
  end if;
end;
$$;

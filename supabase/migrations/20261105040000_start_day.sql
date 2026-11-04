-- Plan months can run payday to payday: the day of the month each plan's month starts on (1 = calendar month).
-- month is then the month the period ends in, which keeps (user_id, month) unique and ordered.
alter table public.month_plans
  add column start_day smallint not null default 1 check (start_day between 1 and 31);

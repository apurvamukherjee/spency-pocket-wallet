-- Bills the user marked "not paid yet" this month although their date fell before the plan's starting balance.
alter table public.month_plans
  add column unpaid_bills uuid[] not null default '{}';

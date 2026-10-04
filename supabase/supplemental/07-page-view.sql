-- Visitor analytics: page_view RLS and reporting functions
--
-- Write side: anyone may insert a row, because every visitor is anonymous and the
-- beacon endpoint runs as anon. The check constraint below bounds what one row can
-- hold; nothing a visitor writes is ever readable back by them.
--
-- Read side: admins only, and only through the aggregate functions below. Route
-- code never selects raw page_view rows — the table grows without bound, and
-- grouping belongs in SQL, which PostgREST cannot express as a plain query.
--
-- The functions are SECURITY INVOKER, like 04-admin-write-rpc.sql: they buy
-- grouping, not privilege. A non-admin calling them hits page_view_admin_read and
-- gets empty results rather than an error.
--
-- Days are UTC calendar days. Report windows are inclusive of today, so p_days = 7
-- is today plus the six days before it.

alter table public.page_view
  drop constraint if exists page_view_bounded;
alter table public.page_view
  add constraint page_view_bounded check (
    length(path) between 1 and 2048
    and left(path, 1) = '/'
    and (referrer_host is null or length(referrer_host) <= 255)
  );

alter table public.page_view enable row level security;

drop policy if exists "page_view_public_insert" on public.page_view;
create policy "page_view_public_insert"
  on public.page_view for insert
  to anon, authenticated
  with check (true);

drop policy if exists "page_view_admin_read" on public.page_view;
create policy "page_view_admin_read"
  on public.page_view for select
  to authenticated
  using ((select public.current_user_admin()));

-- Insert is the only write. No update or delete for anyone through the Data API;
-- retention, when it comes, is a scheduled job, not a client call.
revoke update, delete, truncate on public.page_view from anon, authenticated;

-- ── Reporting ─────────────────────────────────────────────────────────────────

-- Headline totals for the window. visitor_count is distinct across the whole
-- window, which is why it cannot be derived by summing page_view_daily.
create or replace function public.page_view_total(p_days integer)
returns table (view_count bigint, visitor_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select count(*), count(distinct visitor_id)
  from public.page_view
  where created_at >= (current_date - (greatest(p_days, 1) - 1))::timestamptz;
$$;

-- One row per day in the window, zero-filled, oldest first — ready to chart.
create or replace function public.page_view_daily(p_days integer)
returns table (day date, view_count bigint, visitor_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select d.day::date, count(pv.id), count(distinct pv.visitor_id)
  from generate_series(current_date - (greatest(p_days, 1) - 1), current_date, interval '1 day') as d(day)
  left join public.page_view pv
    on pv.created_at >= d.day and pv.created_at < d.day + interval '1 day'
  group by d.day
  order by d.day;
$$;

create or replace function public.page_view_top_path(p_days integer, p_limit integer default 10)
returns table (path text, view_count bigint, visitor_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select pv.path, count(*), count(distinct pv.visitor_id)
  from public.page_view pv
  where pv.created_at >= (current_date - (greatest(p_days, 1) - 1))::timestamptz
  group by pv.path
  order by count(*) desc, pv.path
  limit least(greatest(p_limit, 1), 100);
$$;

-- Null referrer_host is direct traffic (typed URL, bookmark, or a referrer policy
-- that sent nothing); it is reported as its own row, not dropped.
create or replace function public.page_view_top_referrer(p_days integer, p_limit integer default 10)
returns table (referrer_host text, view_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select pv.referrer_host, count(*)
  from public.page_view pv
  where pv.created_at >= (current_date - (greatest(p_days, 1) - 1))::timestamptz
  group by pv.referrer_host
  order by count(*) desc, pv.referrer_host nulls first
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.page_view_total(integer) to authenticated;
grant execute on function public.page_view_daily(integer) to authenticated;
grant execute on function public.page_view_top_path(integer, integer) to authenticated;
grant execute on function public.page_view_top_referrer(integer, integer) to authenticated;

CREATE TABLE IF NOT EXISTS "page_view" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "page_view_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"path" text NOT NULL,
	"referrer_host" text,
	"locale_id" bigint
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_view" ADD CONSTRAINT "page_view_locale_id_locale_id_fk" FOREIGN KEY ("locale_id") REFERENCES "public"."locale"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_page_view_created_at" ON "page_view" USING btree ("created_at");
-- supplemental: 07-page-view.sql
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

-- supplemental: 08-dashboard.sql
-- Admin dashboard: newsroom overview aggregates
--
-- The dashboard summarizes the whole newsroom, so every figure on it is a group-by
-- over a table that grows without bound. Grouping belongs in SQL, which PostgREST
-- cannot express as a plain query, and fetching every row to count it in route code
-- would ship the article table to render five numbers.
--
-- SECURITY INVOKER throughout, like 07-page-view.sql: these buy grouping, not
-- privilege. Article reads go through the content module's policies and page_view
-- reads through page_view_admin_read, so a non-admin gets only what RLS admits.
--
-- 'published' and 'archived' are the content module's seeded status slugs. A story
-- at either is out of the desk's hands; everything else is still being worked on.

-- One row per workflow status, zero-filled, in workflow order — ready for a pipeline.
create or replace function public.article_status_count()
returns table (article_status_id bigint, article_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select s.id, count(a.id)
  from public.article_status s
  left join public.article a
    on a.article_status_id = s.id and a.deleted_at is null
  group by s.id, s.ordinal
  order by s.ordinal, s.id;
$$;

-- Stories still being worked on, the most pressing first: soonest assignment due
-- date (overdue sorts to the top), then the most recently touched. due_at is the
-- earliest across the story's assignments, since that is the one that slips first.
create or replace function public.article_active(p_limit integer default 5)
returns table (
  article_id bigint,
  article_status_id bigint,
  canonical_slug text,
  embargo_until timestamptz,
  updated_at timestamptz,
  due_at timestamptz
)
language sql
security invoker
stable
set search_path = ''
as $$
  select a.id, a.article_status_id, a.canonical_slug, a.embargo_until, a.updated_at,
         min(aa.due_at)
  from public.article a
  join public.article_status s on s.id = a.article_status_id
  left join public.article_assignment aa on aa.article_id = a.id
  where a.deleted_at is null
    and s.slug not in ('published', 'archived')
  group by a.id
  order by min(aa.due_at) asc nulls last, a.updated_at desc, a.id
  limit least(greatest(p_limit, 1), 100);
$$;

-- The most-read stories in a report window. Joins on the public story route,
-- /article/<canonical_slug>, which is the only path a story is read at — previews
-- are never recorded (see EXCLUDED_PREFIXES in src/lib/server/page-view.ts).
create or replace function public.page_view_top_article(p_days integer, p_limit integer default 5)
returns table (article_id bigint, canonical_slug text, view_count bigint, visitor_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select a.id, a.canonical_slug, count(*), count(distinct pv.visitor_id)
  from public.page_view pv
  join public.article a on pv.path = '/article/' || a.canonical_slug
  where pv.created_at >= (current_date - (greatest(p_days, 1) - 1))::timestamptz
    and a.deleted_at is null
  group by a.id, a.canonical_slug
  order by count(*) desc, a.id
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.article_status_count() to authenticated;
grant execute on function public.article_active(integer) to authenticated;
grant execute on function public.page_view_top_article(integer, integer) to authenticated;

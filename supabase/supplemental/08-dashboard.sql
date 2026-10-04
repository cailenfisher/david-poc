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

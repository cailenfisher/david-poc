-- PostgreSQL function: get_dictionary
--
-- Fetches the resolved i18n dictionary for a locale (with fallback) in a
-- single query. This is the only place locale-priority resolution happens —
-- diglossia's createDictionary() trusts its payload to already carry one row
-- per key, and the root layout server load calls this function to build
-- that payload.
--
-- security invoker, not security definer: all three tables already carry
-- public-read RLS (see 00-local-text-rls.sql), so definer would bypass RLS
-- for no benefit and open a privilege-escalation surface. If a future
-- requirement forces security definer, it must carry
-- `set search_path = ''` with every reference fully schema-qualified.

create or replace function public.get_dictionary(
  user_locale_code     text,
  fallback_locale_code text,
  scope_filter         text default null,
  entity_id_filter     bigint default null
)
returns table (
  link_id     bigint,
  slug        text,
  scope       text,
  entity_id   bigint,
  content     text,
  locale_code text
)
language sql
stable
security invoker
as $$
  select distinct on (ltl.slug, ltl.scope, ltl.entity_id)
    ltl.id        as link_id,
    ltl.slug,
    ltl.scope,
    ltl.entity_id,
    lt.content,
    l.code        as locale_code
  from public.local_text lt
  join public.local_text_link ltl on ltl.id = lt.link
  join public.locale l on l.id = lt.locale
  where l.code in (user_locale_code, fallback_locale_code)
    and (
      (scope_filter is null and ltl.scope is null)
      or ltl.scope = scope_filter
    )
    and (
      (entity_id_filter is null and ltl.entity_id is null)
      or ltl.entity_id = entity_id_filter
    )
  order by
    ltl.slug,
    ltl.scope,
    ltl.entity_id,
    case when l.code = user_locale_code then 0 else 1 end
$$;

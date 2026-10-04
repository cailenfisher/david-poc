-- Compound admin writes
--
-- PostgREST has no client-side transactions: two supabase-js calls are two
-- transactions, so a failure between them leaves half-written state — an i18n link
-- with no copy, or copy with no link. These functions exist only where a mutation
-- spans more than one statement and a partial result would be garbage. Everything
-- expressible as a single statement stays in the route as a plain supabase-js call.
--
-- SECURITY INVOKER (the default, stated here because the contrast matters) is
-- load-bearing: the body runs as the calling role, so every statement inside is
-- still checked against the admin-write RLS policies on local_text_link,
-- local_text, and navigation_item. These functions buy atomicity, not privilege —
-- unlike the SECURITY DEFINER helpers in 00-auth-functions.sql, which deliberately
-- bypass RLS and are therefore written to take no caller-supplied identity.

-- ── local_text_link + local_text ──────────────────────────────────────────────

-- Dropped and recreated rather than `create or replace`d, because adding a parameter makes a
-- new signature: the four-argument version would survive alongside it and a four-argument call
-- would then be ambiguous between the two. Existing callers that pass four arguments still work
-- through p_entity_id's default.
drop function if exists public.create_local_text_entry(text, text, bigint[], text[]);

create or replace function public.create_local_text_entry(
  p_slug       text,
  p_scope      text,
  p_locale_ids bigint[],
  p_contents   text[],
  -- Entity-bound copy: an article's headline, a supplier's name. Null is global or scoped UI
  -- copy, which is what the local-text admin screen creates.
  p_entity_id  bigint default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link_id bigint;
begin
  if p_slug is null or btrim(p_slug) = '' then
    raise exception 'slug is required';
  end if;

  if coalesce(array_length(p_locale_ids, 1), 0)
     <> coalesce(array_length(p_contents, 1), 0) then
    raise exception 'locale_ids and contents must have the same length';
  end if;

  insert into public.local_text_link (slug, scope, entity_id)
  values (btrim(p_slug), nullif(btrim(coalesce(p_scope, '')), ''), p_entity_id)
  returning id into v_link_id;

  -- Blank translations are skipped rather than stored as empty copy.
  insert into public.local_text (link, locale, content)
  select v_link_id, p_locale_ids[i], btrim(p_contents[i])
  from generate_subscripts(p_contents, 1) as i
  where btrim(coalesce(p_contents[i], '')) <> '';

  return v_link_id;
end;
$$;

create or replace function public.delete_local_text_entry(p_link_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- local_text.link is ON DELETE RESTRICT, so the copy rows have to go first.
  delete from public.local_text where link = p_link_id;
  delete from public.local_text_link where id = p_link_id;
end;
$$;

-- ── navigation_item + its copy link ───────────────────────────────────────────

create or replace function public.create_navigation_item(
  p_slug       text,
  p_href       text,
  p_scope      text,
  p_sort_order integer default 0
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link_id bigint;
  v_id      bigint;
begin
  if p_slug is null or btrim(p_slug) = ''
     or p_href is null or btrim(p_href) = ''
     or p_scope is null or btrim(p_scope) = '' then
    raise exception 'slug, href, and scope are required';
  end if;

  insert into public.local_text_link (slug, scope, entity_id)
  values (btrim(p_slug), null, null)
  returning id into v_link_id;

  insert into public.navigation_item (local_text_link_id, href, scope, sort_order)
  values (v_link_id, btrim(p_href), btrim(p_scope), coalesce(p_sort_order, 0))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.delete_navigation_item(p_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link_id bigint;
begin
  select ni.local_text_link_id into v_link_id
  from public.navigation_item ni
  where ni.id = p_id;

  delete from public.navigation_item where id = p_id;

  if v_link_id is not null then
    delete from public.local_text where link = v_link_id;
    delete from public.local_text_link where id = v_link_id;
  end if;
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
--
-- These all write, so anon gets nothing. RLS still decides whether the caller is
-- actually allowed to touch the rows.

grant execute on function
  public.create_local_text_entry(text, text, bigint[], text[], bigint) to authenticated;
grant execute on function public.delete_local_text_entry(bigint) to authenticated;
grant execute on function
  public.create_navigation_item(text, text, text, integer) to authenticated;
grant execute on function public.delete_navigation_item(bigint) to authenticated;

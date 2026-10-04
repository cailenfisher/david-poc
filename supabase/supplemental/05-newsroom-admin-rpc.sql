-- Newsroom admin compound writes
--
-- Same rationale as 04-admin-write-rpc.sql, applied to the article editor: PostgREST
-- has no client-side transactions, so anything spanning more than one statement whose
-- partial result would be garbage belongs in a function. Editing an article's copy is
-- the textbook case — a local_text_link with no local_text row renders as a
-- `[missing: …]` sentinel on the public page, which is worse than the edit failing.
--
-- SECURITY INVOKER throughout, stated explicitly because it is load-bearing: the body
-- runs as the caller, so the content module's admin-write policies still check every
-- statement inside. These buy atomicity, not privilege. Anything expressible as one
-- statement stays a plain supabase-js call in the route.
--
-- set search_path = '' with every reference schema-qualified, per CLAUDE.md.

-- ── Entity-bound copy ─────────────────────────────────────────────────────────

-- Upserts one locale's text for one (slug, scope, entity_id) key, creating the link if
-- it does not exist yet. create_local_text_entry only ever inserts a link, so it cannot
-- serve an editor re-saving a headline that already has one.
--
-- Blank content deletes that locale's row rather than storing an empty string, so a
-- cleared field falls back to the default locale instead of rendering as blank. The link
-- is left in place: it is the identity of the field, not of the translation.
create or replace function public.set_entity_copy(
  p_slug      text,
  p_scope     text,
  p_entity_id bigint,
  p_locale_id bigint,
  p_content   text
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
  if p_locale_id is null then
    raise exception 'locale_id is required';
  end if;

  -- Inference on the three columns rather than a named constraint, matching the
  -- seed convention. The index is NULLS NOT DISTINCT, so a global key (both null)
  -- conflicts correctly instead of inserting a duplicate.
  insert into public.local_text_link (slug, scope, entity_id)
  values (btrim(p_slug), nullif(btrim(coalesce(p_scope, '')), ''), p_entity_id)
  on conflict (slug, scope, entity_id) do update
    set slug = excluded.slug
  returning id into v_link_id;

  if btrim(coalesce(p_content, '')) = '' then
    delete from public.local_text where link = v_link_id and locale = p_locale_id;
  else
    insert into public.local_text (link, locale, content)
    values (v_link_id, p_locale_id, btrim(p_content))
    on conflict (link, locale) do update set content = excluded.content;
  end if;

  return v_link_id;
end;
$$;

-- ── Article body blocks ───────────────────────────────────────────────────────

-- Creates or updates one block and its prose together. p_block_id null inserts.
--
-- Position is not unique on article_block, so a new block takes max(position) + 1
-- rather than relying on a conflict target that does not exist.
create or replace function public.upsert_article_block(
  p_article_id     bigint,
  p_block_type     text,
  p_text           text,
  p_locale_id      bigint,
  p_block_id       bigint default null,
  p_content        jsonb default '{}'::jsonb,
  p_media_asset_id bigint default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_block_id bigint;
begin
  if p_article_id is null then
    raise exception 'article_id is required';
  end if;

  if p_block_id is null then
    insert into public.article_block (article_id, block_type, position, content, media_asset_id)
    values (
      p_article_id,
      p_block_type::public.article_block_type,
      coalesce(
        (select max(b.position) from public.article_block b where b.article_id = p_article_id),
        0
      ) + 1,
      coalesce(p_content, '{}'::jsonb),
      p_media_asset_id
    )
    returning id into v_block_id;
  else
    update public.article_block
    set block_type = p_block_type::public.article_block_type,
        content = coalesce(p_content, '{}'::jsonb),
        media_asset_id = p_media_asset_id
    where id = p_block_id and article_id = p_article_id
    returning id into v_block_id;

    -- Null means the update matched nothing, which under RLS is indistinguishable
    -- from "not allowed" — either way the caller asked for a block it cannot write.
    if v_block_id is null then
      raise exception 'block % not found on article %', p_block_id, p_article_id;
    end if;
  end if;

  perform public.set_entity_copy('text', 'article_block', v_block_id, p_locale_id, p_text);

  return v_block_id;
end;
$$;

-- Removes a block and the copy keyed to it. local_text_link.entity_id is polymorphic
-- and carries no foreign key by design, so nothing cascades — the copy has to be
-- deleted here or it is orphaned, and a later block reusing that id would inherit it.
create or replace function public.delete_article_block(p_block_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link_id bigint;
begin
  select l.id into v_link_id
  from public.local_text_link l
  where l.scope = 'article_block' and l.slug = 'text' and l.entity_id = p_block_id;

  if v_link_id is not null then
    delete from public.local_text where link = v_link_id;
    delete from public.local_text_link where id = v_link_id;
  end if;

  delete from public.article_block where id = p_block_id;
end;
$$;

-- Writes a whole ordering in one statement set. Reordering by individual updates would
-- leave the body scrambled if the second call failed.
create or replace function public.reorder_article_blocks(
  p_article_id bigint,
  p_block_ids  bigint[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.article_block b
  set position = v.ordinal
  from (
    select id, ordinal
    from unnest(p_block_ids) with ordinality as t(id, ordinal)
  ) as v
  where b.id = v.id and b.article_id = p_article_id;
end;
$$;

-- ── Bylines and filing ────────────────────────────────────────────────────────

-- Replaces the byline list, in order. Delete-then-insert is two statements, and a
-- failure between them would leave an article with no byline at all.
create or replace function public.set_article_bylines(
  p_article_id bigint,
  p_author_ids bigint[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.article_byline
  where article_id = p_article_id
    and (p_author_ids is null or author_profile_id <> all (p_author_ids));

  insert into public.article_byline (article_id, author_profile_id, position)
  select p_article_id, v.id, v.ordinal
  from unnest(coalesce(p_author_ids, '{}'::bigint[])) with ordinality as v(id, ordinal)
  on conflict (article_id, author_profile_id) do update set position = excluded.position;
end;
$$;

-- Replaces all three filing dimensions together. They are edited as one form, and a
-- partial apply would file a story under its new sections but its old topics.
create or replace function public.set_article_filing(
  p_article_id  bigint,
  p_section_ids bigint[],
  p_topic_ids   bigint[],
  p_tag_ids     bigint[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.article_section
  where article_id = p_article_id
    and (p_section_ids is null or section_id <> all (p_section_ids));
  insert into public.article_section (article_id, section_id)
  select p_article_id, id from unnest(coalesce(p_section_ids, '{}'::bigint[])) as id
  on conflict (article_id, section_id) do nothing;

  delete from public.article_topic
  where article_id = p_article_id
    and (p_topic_ids is null or topic_id <> all (p_topic_ids));
  insert into public.article_topic (article_id, topic_id)
  select p_article_id, id from unnest(coalesce(p_topic_ids, '{}'::bigint[])) as id
  on conflict (article_id, topic_id) do nothing;

  delete from public.article_tag
  where article_id = p_article_id
    and (p_tag_ids is null or tag_id <> all (p_tag_ids));
  insert into public.article_tag (article_id, tag_id)
  select p_article_id, id from unnest(coalesce(p_tag_ids, '{}'::bigint[])) as id
  on conflict (article_id, tag_id) do nothing;
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
-- authenticated, not anon. These are SECURITY INVOKER, so RLS is what actually
-- decides whether a given principal's statements are allowed; the grant only
-- controls who may attempt the call.
grant execute on function
  public.set_entity_copy(text, text, bigint, bigint, text) to authenticated;
grant execute on function
  public.upsert_article_block(bigint, text, text, bigint, bigint, jsonb, bigint) to authenticated;
grant execute on function public.delete_article_block(bigint) to authenticated;
grant execute on function public.reorder_article_blocks(bigint, bigint[]) to authenticated;
grant execute on function public.set_article_bylines(bigint, bigint[]) to authenticated;
grant execute on function
  public.set_article_filing(bigint, bigint[], bigint[], bigint[]) to authenticated;

-- ── People ────────────────────────────────────────────────────────────────────

-- Lists principals with the email of the auth identity behind each.
--
-- SECURITY DEFINER, which is the opposite of everything above, and for a specific
-- reason: `auth.users` is not in PostgREST's exposed schemas, so no amount of RLS on
-- public tables makes an email readable through the Data API. A definer function is
-- the only way to join it, and the architecture deliberately keeps email out of
-- public.user_account rather than duplicating identity data.
--
-- Because it is definer, RLS does not apply inside, so the admin check is explicit and
-- comes first. Without it any authenticated caller could enumerate every email in the
-- system. It takes no caller-supplied identity for the same reason the auth helpers
-- do not: there is nothing to pass that could be forged.
create or replace function public.admin_list_people()
returns table (
  user_account_id bigint,
  email           text,
  admin           boolean,
  created_at      timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.current_user_admin()), false) then
    raise exception 'admin privileges required';
  end if;

  return query
  select ua.id, au.email::text, ua.admin, ua.created_at
  from public.user_account ua
  left join auth.users au on au.id = ua.auth_user_id
  order by ua.id;
end;
$$;

-- Counts the admins, so the UI can refuse to remove the last one. Definer for the
-- same reason: a non-admin must not be able to probe the shape of the admin set, and
-- an admin's own RLS view of user_account is not guaranteed to cover every row.
create or replace function public.admin_count()
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::integer from public.user_account where admin;
$$;

grant execute on function public.admin_list_people() to authenticated;
grant execute on function public.admin_count() to authenticated;

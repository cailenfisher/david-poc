-- Media: the public attribution projection, and atomic asset writes.
--
-- media_asset_rights and media_asset_source are admin-only (02-content-rls.sql): rights hold
-- expiry dates and credit obligations, and a source page can name a paid stock vendor. A
-- reader's page still has to credit a Creative Commons image and link its license, so this file
-- exposes the one slice of them a reader may see, and nothing wider.

-- ── media_asset_attribution ──────────────────────────────────────────────────
--
-- Deliberately a view that runs with its owner's rights (the default, `security_invoker =
-- false`) — that is the whole mechanism: it reads two tables anon cannot, and its own WHERE
-- and column list are the policy. Supabase's linter flags security-definer views; this is the
-- reviewed exception, and it is safe because of what it selects:
--   * only licenses that exist to be credited in public — a rights_managed or royalty_free
--     image's source is never exposed;
--   * only the two URLs a credit line links to — no expiry, no credit_required, no dates.
-- Widening either needs the same scrutiny as widening a policy. pnpm sql:check asserts both.
create or replace view public.media_asset_attribution as
  select
    r.media_asset_id,
    r.license,
    s.source_url,
    s.license_url
  from public.media_asset_rights r
  join public.media_asset_source s on s.media_asset_id = r.media_asset_id
  where r.license in ('creative_commons', 'public_domain');

revoke all on public.media_asset_attribution from public, anon, authenticated;
grant select on public.media_asset_attribution to anon, authenticated;

-- ── Compound writes ──────────────────────────────────────────────────────────
--
-- An asset is an asset row, a rights row, a source row and up to three pieces of copy per
-- locale. Written as separate supabase-js calls, a failure between them leaves an asset with
-- no rights — which publish validation then has to explain. These make it one transaction.
--
-- SECURITY INVOKER, like every compound write in 04-admin-write-rpc.sql: the body runs as the
-- caller, so the admin policies on each table still check every statement. They buy atomicity,
-- not privilege.

-- Copy for one asset in one locale. A null argument leaves that slug alone; a blank one removes
-- it, so an editor clearing a caption does not leave a stale one behind.
create or replace function public.set_media_asset_copy(
  p_media_asset_id bigint,
  p_locale_id      bigint,
  p_alt_text       text default null,
  p_caption        text default null,
  p_credit         text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_slug    text;
  v_content text;
  v_link_id bigint;
begin
  if not exists (select 1 from public.media_asset where id = p_media_asset_id) then
    raise exception 'media asset % does not exist', p_media_asset_id;
  end if;

  for v_slug, v_content in
    select * from (values ('alt_text', p_alt_text), ('caption', p_caption), ('credit', p_credit)) as copy(slug, content)
    where content is not null
  loop
    -- Unique on (slug, scope, entity_id) NULLS NOT DISTINCT, so this is a no-op when the link exists.
    insert into public.local_text_link (slug, scope, entity_id)
    values (v_slug, 'media_asset', p_media_asset_id)
    on conflict do nothing;

    select id into v_link_id
    from public.local_text_link
    where slug = v_slug and scope = 'media_asset' and entity_id = p_media_asset_id;

    if btrim(v_content) = '' then
      delete from public.local_text where link = v_link_id and locale = p_locale_id;
    else
      insert into public.local_text (link, locale, content)
      values (v_link_id, p_locale_id, btrim(v_content))
      on conflict (link, locale) do update set content = excluded.content;
    end if;
  end loop;
end;
$$;

-- Rights and provenance for one asset. One row of each per asset, so both are plain upserts.
-- A blank source URL removes the source row rather than storing an empty string, which is what
-- publish validation reads as "no source recorded".
create or replace function public.set_media_asset_rights(
  p_media_asset_id bigint,
  p_license        public.media_license,
  p_credit_required boolean default true,
  p_expires_at     timestamptz default null,
  p_source_url     text default null,
  p_license_url    text default null,
  p_retrieved_at   timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.media_asset where id = p_media_asset_id) then
    raise exception 'media asset % does not exist', p_media_asset_id;
  end if;

  insert into public.media_asset_rights (media_asset_id, license, credit_required, expires_at)
  values (p_media_asset_id, p_license, p_credit_required, p_expires_at)
  on conflict (media_asset_id) do update
    set license = excluded.license,
        credit_required = excluded.credit_required,
        expires_at = excluded.expires_at;

  if btrim(coalesce(p_source_url, '')) = '' then
    delete from public.media_asset_source where media_asset_id = p_media_asset_id;
  else
    insert into public.media_asset_source (media_asset_id, source_url, license_url, retrieved_at)
    values (
      p_media_asset_id,
      btrim(p_source_url),
      nullif(btrim(coalesce(p_license_url, '')), ''),
      p_retrieved_at
    )
    on conflict (media_asset_id) do update
      set source_url = excluded.source_url,
          license_url = excluded.license_url,
          retrieved_at = excluded.retrieved_at;
  end if;
end;
$$;

-- A new asset with its rights, provenance and copy in one transaction. The uploader is the
-- caller's principal, never a parameter.
create or replace function public.create_media_asset(
  p_media_type      public.media_type,
  p_storage_key     text,
  p_mime_type       text,
  p_license         public.media_license,
  p_width           integer default null,
  p_height          integer default null,
  p_credit_required boolean default true,
  p_expires_at      timestamptz default null,
  p_source_url      text default null,
  p_license_url     text default null,
  p_retrieved_at    timestamptz default null,
  p_locale_id       bigint default null,
  p_alt_text        text default null,
  p_caption         text default null,
  p_credit          text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uploader bigint := (select public.current_user_id());
  v_id       bigint;
begin
  if v_uploader is null then
    raise exception 'no signed-in principal to record as the uploader' using errcode = '42501';
  end if;

  insert into public.media_asset (media_type, storage_key, width, height, mime_type, uploaded_by)
  values (p_media_type, p_storage_key, p_width, p_height, p_mime_type, v_uploader)
  returning id into v_id;

  perform public.set_media_asset_rights(
    v_id, p_license, p_credit_required, p_expires_at, p_source_url, p_license_url, p_retrieved_at
  );

  if p_locale_id is not null then
    perform public.set_media_asset_copy(v_id, p_locale_id, p_alt_text, p_caption, p_credit);
  end if;

  return v_id;
end;
$$;

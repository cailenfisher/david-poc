-- Custom SQL migration file, put your code below! --

-- supplemental: 10-media-asset-write.sql
-- Media asset writes: an image, its rights, its provenance and its copy, atomically
--
-- An image is only usable once all of these exist: the media_asset row, a
-- media_asset_rights row, a media_asset_source row (where it came from and under exactly
-- which license), and alt_text / caption / credit copy under the media_asset scope. Any
-- subset is garbage: no alt text renders `[missing: alt_text]`, no rights row means an
-- image with no license on record. PostgREST has no client-side transactions, so the
-- whole set is written by a function, for the same reason as 05-newsroom-admin-rpc.sql.
--
-- SECURITY INVOKER throughout: the body runs as the caller, so the admin-write policies
-- still check every statement. These buy atomicity, not privilege.
--
-- set search_path = '' with every reference schema-qualified, per CLAUDE.md.
--
-- No delete function: deleting assets is deferred, and delete_article_block leaves the
-- asset alone, which is correct because an asset can be reused.

-- ── media_asset_source ────────────────────────────────────────────────────────
-- The table itself comes from the drizzle migration (src/lib/server/schema.ts). Admin
-- only, like media_asset_rights: no public read.

alter table public.media_asset_source enable row level security;

drop policy if exists content_media_asset_source_admin on public.media_asset_source;
create policy content_media_asset_source_admin on public.media_asset_source
  for all to authenticated
  using ((select public.current_user_admin()))
  with check ((select public.current_user_admin()));

-- ── Validation shared by create and rights edits ──────────────────────────────

create or replace function public.validate_media_asset_rights(
  p_license         text,
  p_credit_required boolean,
  p_credit          text,
  p_source_url      text,
  p_license_url     text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_license is null or btrim(p_license) = '' then
    raise exception 'license is required';
  end if;
  if btrim(coalesce(p_source_url, '')) !~ '^https?://' then
    raise exception 'source_url must be an http(s) URL';
  end if;
  -- Different CC licenses have different terms, so the exact one must be on record.
  if p_license = 'creative_commons' and btrim(coalesce(p_license_url, '')) = '' then
    raise exception 'license_url is required for creative_commons';
  end if;
  if p_credit_required and btrim(coalesce(p_credit, '')) = '' then
    raise exception 'credit is required when the license requires credit';
  end if;
end;
$$;

-- ── Create ────────────────────────────────────────────────────────────────────

create or replace function public.create_media_asset(
  p_storage_key     text,
  p_mime_type       text,
  p_width           integer,
  p_height          integer,
  p_license         text,
  p_credit_required boolean,
  p_expires_at      timestamptz,
  p_source_url      text,
  p_license_url     text,
  p_retrieved_at    timestamptz,
  p_locale_id       bigint,
  p_alt_text        text,
  p_caption         text,
  p_credit          text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uploader_id bigint := public.current_user_id();
  v_asset_id    bigint;
begin
  if v_uploader_id is null then
    raise exception 'an authenticated user account is required';
  end if;
  if p_storage_key is null or p_storage_key not like 'media/%' then
    raise exception 'storage_key must start with media/';
  end if;
  if btrim(coalesce(p_alt_text, '')) = '' then
    raise exception 'alt_text is required';
  end if;
  if p_retrieved_at is null then
    raise exception 'retrieved_at is required';
  end if;
  perform public.validate_media_asset_rights(
    p_license, p_credit_required, p_credit, p_source_url, p_license_url);

  insert into public.media_asset (media_type, storage_key, width, height, mime_type, uploaded_by)
  values ('image', p_storage_key, p_width, p_height, p_mime_type, v_uploader_id)
  returning id into v_asset_id;

  insert into public.media_asset_rights (media_asset_id, license, credit_required, expires_at)
  values (v_asset_id, p_license::public.media_license, p_credit_required, p_expires_at);

  insert into public.media_asset_source (media_asset_id, source_url, license_url, retrieved_at)
  values (v_asset_id, btrim(p_source_url), nullif(btrim(coalesce(p_license_url, '')), ''), p_retrieved_at);

  perform public.set_entity_copy('alt_text', 'media_asset', v_asset_id, p_locale_id, p_alt_text);
  perform public.set_entity_copy('caption', 'media_asset', v_asset_id, p_locale_id, p_caption);
  perform public.set_entity_copy('credit', 'media_asset', v_asset_id, p_locale_id, p_credit);

  return v_asset_id;
end;
$$;

-- ── Copy ──────────────────────────────────────────────────────────────────────

-- Adds or fixes one locale's alt text, caption and credit. A blank alt text is refused:
-- clearing it would make a published article invalid in that locale.
create or replace function public.set_media_asset_copy(
  p_media_asset_id bigint,
  p_locale_id      bigint,
  p_alt_text       text,
  p_caption        text,
  p_credit         text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if btrim(coalesce(p_alt_text, '')) = '' then
    raise exception 'alt_text is required';
  end if;
  if not exists (select 1 from public.media_asset where id = p_media_asset_id) then
    raise exception 'media asset % not found', p_media_asset_id;
  end if;

  perform public.set_entity_copy('alt_text', 'media_asset', p_media_asset_id, p_locale_id, p_alt_text);
  perform public.set_entity_copy('caption', 'media_asset', p_media_asset_id, p_locale_id, p_caption);
  perform public.set_entity_copy('credit', 'media_asset', p_media_asset_id, p_locale_id, p_credit);
end;
$$;

-- ── Rights and source ─────────────────────────────────────────────────────────

-- Updates both rows, inserting either one if it is missing. media_asset_rights has no
-- unique key on media_asset_id, so this is update-then-insert rather than a conflict
-- target. The credit lives in local_text, so the check that a required credit exists
-- reads it for the caller's locale of choice: any locale's credit satisfies it.
create or replace function public.set_media_asset_rights(
  p_media_asset_id  bigint,
  p_license         text,
  p_credit_required boolean,
  p_expires_at      timestamptz,
  p_source_url      text,
  p_license_url     text,
  p_retrieved_at    timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_has_credit boolean;
begin
  if not exists (select 1 from public.media_asset where id = p_media_asset_id) then
    raise exception 'media asset % not found', p_media_asset_id;
  end if;
  if p_retrieved_at is null then
    raise exception 'retrieved_at is required';
  end if;

  select exists (
    select 1
    from public.local_text_link l
    join public.local_text t on t.link = l.id
    where l.scope = 'media_asset' and l.slug = 'credit' and l.entity_id = p_media_asset_id
      and btrim(t.content) <> ''
  ) into v_has_credit;

  perform public.validate_media_asset_rights(
    p_license, p_credit_required, case when v_has_credit then 'x' end, p_source_url, p_license_url);

  update public.media_asset_rights
  set license = p_license::public.media_license,
      credit_required = p_credit_required,
      expires_at = p_expires_at
  where media_asset_id = p_media_asset_id;
  if not found then
    insert into public.media_asset_rights (media_asset_id, license, credit_required, expires_at)
    values (p_media_asset_id, p_license::public.media_license, p_credit_required, p_expires_at);
  end if;

  insert into public.media_asset_source (media_asset_id, source_url, license_url, retrieved_at)
  values (p_media_asset_id, btrim(p_source_url), nullif(btrim(coalesce(p_license_url, '')), ''), p_retrieved_at)
  on conflict (media_asset_id) do update
    set source_url = excluded.source_url,
        license_url = excluded.license_url,
        retrieved_at = excluded.retrieved_at;
end;
$$;

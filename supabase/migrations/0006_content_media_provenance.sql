ALTER TABLE "media_asset_source" DROP CONSTRAINT "media_asset_source_media_asset_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_media_asset_rights_asset";--> statement-breakpoint
ALTER TABLE "media_asset_source" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "media_asset_source" ALTER COLUMN "id" SET MAXVALUE 9223372036854775807;--> statement-breakpoint
ALTER TABLE "media_asset_source" ALTER COLUMN "retrieved_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "lead_media_asset_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "article" ADD CONSTRAINT "article_lead_media_asset_id_media_asset_id_fk" FOREIGN KEY ("lead_media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_media_asset_source_asset" ON "media_asset_source" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_article_lead_media" ON "article" USING btree ("lead_media_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_media_asset_rights_asset" ON "media_asset_rights" USING btree ("media_asset_id");
-- supplemental: 02-content-rls.sql
-- Content module RLS
--
-- Every table this module creates had row level security DISABLED until now, which with
-- Supabase's bootstrap grants (all privileges on public tables to anon and authenticated)
-- meant anyone holding the publishable key could read and write all 27 of them —
-- `subscriber` and `comment` included. Verified exploitable before writing this file: as
-- the anon role, inserting and then deleting every row of `subscriber` both succeeded.
--
-- Conventions, matching superprototype's 03-base-rls.sql:
--   1. Helpers are called as `(select public.current_user_admin())`, never bare, so the
--      planner hoists them into an InitPlan evaluated once per statement.
--   2. Every policy names its roles with `to`, so a policy cannot silently apply to a role
--      nobody considered.
--   3. Admin gating goes through public.current_user_admin() rather than an inline
--      `exists (select 1 from public.user_account …)`, which would run as the caller and so
--      depend on user_account's own read policy staying as it is.
--
-- The access model in one paragraph: published editorial content is world-readable;
-- editorial workflow (revisions, assignments, checklists), media licensing terms, preview
-- tokens and subscriber PII are admin-only; comments are world-readable once approved and
-- world-insertable as pending; and newsletter signup goes through a SECURITY DEFINER
-- function rather than granting anon any access to `subscriber` at all.

-- ── Visibility helper ─────────────────────────────────────────────────────────
--
-- The public-visibility rule for an article, in one place: not soft-deleted, status
-- 'published', and past any embargo. It is the same predicate the module's own queries
-- used, so a row the application considered public is exactly a row RLS now admits.
--
-- SECURITY DEFINER is load-bearing twice over. It keeps the function from re-entering
-- `article`'s own policy — which would be infinite recursion for the policy that calls it —
-- and it lets a dependent table (a block, a byline) ask about an article the caller may not
-- otherwise read. STABLE and `set search_path = ''` for the usual reasons.
create or replace function public.content_article_public(p_article_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.article a
    join public.article_status s on s.id = a.article_status_id
    where a.id = p_article_id
      and a.deleted_at is null
      and s.slug = 'published'
      and (a.embargo_until is null or a.embargo_until <= now())
  )
$$;

grant execute on function public.content_article_public(bigint) to anon, authenticated;

-- ── Public taxonomy and chrome ────────────────────────────────────────────────
--
-- Read by anyone, written by admins. None of these carry anything that is not already on
-- the page: a section's name, a tag, the publisher's own profile. article_status is in this
-- group because every public query resolves the slug 'published' through it — with it
-- unreadable, the site shows nothing at all.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'article_status', 'section', 'topic', 'tag', 'author_profile', 'publisher_profile',
    'media_asset', 'newsletter', 'front', 'front_slot'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);

    execute format('drop policy if exists %I on public.%I',
      'content_' || v_table || '_public_read', v_table);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      'content_' || v_table || '_public_read', v_table);

    execute format('drop policy if exists %I on public.%I',
      'content_' || v_table || '_admin', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.current_user_admin()))
         with check ((select public.current_user_admin()))',
      'content_' || v_table || '_admin', v_table);
  end loop;
end $$;

-- ── Articles ──────────────────────────────────────────────────────────────────

alter table public.article enable row level security;

drop policy if exists "content_article_public_read" on public.article;
-- Inlined rather than calling content_article_public(id): the predicate is on this table's
-- own columns, so inlining lets the planner use the status and embargo indexes, and the
-- status lookup is an uncorrelated subselect evaluated once per statement. A correlated
-- function call per row would defeat both.
create policy "content_article_public_read" on public.article for select to anon, authenticated
  using (
    deleted_at is null
    and (embargo_until is null or embargo_until <= now())
    and article_status_id = (select id from public.article_status where slug = 'published')
  );

drop policy if exists "content_article_admin" on public.article;
create policy "content_article_admin" on public.article for all to authenticated
  using ((select public.current_user_admin()))
  with check ((select public.current_user_admin()));

-- ── Per-article content, visible exactly when its article is ──────────────────
--
-- Blocks, bylines and the join rows to taxonomy. Each is readable only through a publicly
-- visible article, so an unpublished draft leaks neither its body nor the fact that it is
-- filed under a particular topic.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'article_block', 'article_byline', 'article_section', 'article_topic', 'article_tag'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);

    execute format('drop policy if exists %I on public.%I',
      'content_' || v_table || '_public_read', v_table);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated
         using ((select public.content_article_public(article_id)))',
      'content_' || v_table || '_public_read', v_table);

    execute format('drop policy if exists %I on public.%I',
      'content_' || v_table || '_admin', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.current_user_admin()))
         with check ((select public.current_user_admin()))',
      'content_' || v_table || '_admin', v_table);
  end loop;
end $$;

-- ── Live coverage ─────────────────────────────────────────────────────────────
--
-- A live blog hangs off an article, and its updates off the coverage. Both follow the
-- article's visibility: coverage of an embargoed story must not be readable before the
-- story is.

alter table public.live_coverage enable row level security;

drop policy if exists "content_live_coverage_public_read" on public.live_coverage;
create policy "content_live_coverage_public_read" on public.live_coverage
  for select to anon, authenticated
  using ((select public.content_article_public(article_id)));

drop policy if exists "content_live_coverage_admin" on public.live_coverage;
create policy "content_live_coverage_admin" on public.live_coverage for all to authenticated
  using ((select public.current_user_admin()))
  with check ((select public.current_user_admin()));

alter table public.live_update enable row level security;

drop policy if exists "content_live_update_public_read" on public.live_update;
create policy "content_live_update_public_read" on public.live_update
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.live_coverage c
      where c.id = live_coverage_id
        and (select public.content_article_public(c.article_id))
    )
  );

drop policy if exists "content_live_update_admin" on public.live_update;
create policy "content_live_update_admin" on public.live_update for all to authenticated
  using ((select public.current_user_admin()))
  with check ((select public.current_user_admin()));

-- ── Editorial workflow, licensing, and secrets: admin only ────────────────────
--
-- No public read of any kind. Revisions carry unpublished drafts; assignments and
-- checklists are internal process; media_asset_rights holds licensing terms that are
-- nobody else's business, and media_asset_source the provenance behind them (the public face
-- of both is the media_asset_attribution view in 03-content-media.sql); and article_preview_token holds the credentials that let someone
-- read an unpublished article, so a public read would make every draft enumerable.
--
-- Note what is deliberately absent: no `for select using (true)`. These tables return
-- nothing to anon, which is why the preview route goes through the functions below rather
-- than reading the token table itself.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'article_revision', 'article_assignment', 'publish_checklist_item',
    'article_checklist_state', 'media_asset_rights', 'media_asset_source', 'article_preview_token',
    'subscriber', 'newsletter_subscription'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);

    execute format('drop policy if exists %I on public.%I',
      'content_' || v_table || '_admin', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.current_user_admin()))
         with check ((select public.current_user_admin()))',
      'content_' || v_table || '_admin', v_table);
  end loop;
end $$;

-- ── Comments ──────────────────────────────────────────────────────────────────

alter table public.comment enable row level security;

drop policy if exists "content_comment_public_read" on public.comment;
-- Approved comments on publicly visible articles. A pending or rejected comment is visible
-- to admins only, so moderation is not a thing readers watch happen.
create policy "content_comment_public_read" on public.comment for select to anon, authenticated
  using (status = 'approved' and (select public.content_article_public(article_id)));

drop policy if exists "content_comment_public_insert" on public.comment;
-- Anyone may submit a comment, on an article that is published and accepting them, and only
-- as pending: `with check` on the status column is what stops a submitter approving their
-- own comment by posting the field.
create policy "content_comment_public_insert" on public.comment for insert to anon, authenticated
  with check (
    status = 'pending'
    and (select public.content_article_public(article_id))
    and exists (select 1 from public.article a where a.id = article_id and a.allow_comment)
  );

drop policy if exists "content_comment_admin" on public.comment;
create policy "content_comment_admin" on public.comment for all to authenticated
  using ((select public.current_user_admin()))
  with check ((select public.current_user_admin()));

-- ── Newsletter signup ─────────────────────────────────────────────────────────
--
-- Signup needs to write `subscriber`, which anon cannot touch — deliberately, because it is
-- PII and a table anon could insert into is a table anon can probe: a unique-violation on
-- the email column answers "is this person subscribed?" for anyone who asks.
--
-- So signup goes through a definer function instead. It is idempotent, and it returns void
-- rather than an id or a status, so a caller learns nothing about whether the address was
-- already on the list.
create or replace function public.content_subscribe(
  p_email_address   text,
  p_newsletter_slug text,
  p_locale          text default 'en'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscriber_id bigint;
  v_newsletter_id bigint;
begin
  if p_email_address is null or btrim(p_email_address) = '' then
    raise exception 'an email address is required';
  end if;

  select id into v_newsletter_id
  from public.newsletter
  where slug = p_newsletter_slug;

  if not found then
    raise exception 'no such newsletter';
  end if;

  insert into public.subscriber (email_address, locale)
  values (lower(btrim(p_email_address)), coalesce(nullif(btrim(p_locale), ''), 'en'))
  on conflict (email_address) do update set locale = excluded.locale
  returning id into v_subscriber_id;

  -- Re-subscribing clears a previous unsubscribe rather than inserting a second row.
  insert into public.newsletter_subscription (newsletter_id, subscriber_id)
  values (v_newsletter_id, v_subscriber_id)
  on conflict (newsletter_id, subscriber_id) do update set unsubscribed_at = null;
end;
$$;

grant execute on function public.content_subscribe(text, text, text) to anon, authenticated;

-- ── Moving an article through the workflow ────────────────────────────────────
--
-- Three statements: resolve the target status, enforce the publish gate, and update the
-- article — stamping published_at the first time it goes live, and only the first time, so a
-- republish does not rewrite the date the story broke.
--
-- The checklist gate lives here rather than only in the route because it is the one rule that
-- must not be bypassable: an editor posting the form directly, a script, or a future second
-- screen all go through this. The editorial checks that need resolved copy — a headline within
-- Google's length limit, a dek, a byline, alt text on every image — stay in
-- validateArticleForPublish, because SQL has no dictionary and the answer depends on which
-- locale is being published.
--
-- SECURITY INVOKER, so the update is still checked against the article admin policy.
create or replace function public.content_transition_article_status(
  p_article_id  bigint,
  p_status_slug text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status_id   bigint;
  v_unsatisfied text;
  v_updated     integer;
begin
  select id into v_status_id from public.article_status where slug = p_status_slug;
  if not found then
    raise exception 'no article_status with slug %', p_status_slug;
  end if;

  if p_status_slug = 'published' then
    -- An item with no state row is unsatisfied, which is why this is a left join from the
    -- required items rather than a filter over the state table: never having ticked a box is
    -- the common case, not a missing record.
    select string_agg(i.slug, ', ' order by i.ordinal) into v_unsatisfied
    from public.publish_checklist_item i
    left join public.article_checklist_state s
      on s.publish_checklist_item_id = i.id and s.article_id = p_article_id
    where i.required and coalesce(s.satisfied, false) = false;

    if v_unsatisfied is not null then
      raise exception 'publish checklist incomplete: %', v_unsatisfied;
    end if;
  end if;

  update public.article
  set article_status_id = v_status_id,
      published_at = case
        when p_status_slug = 'published' and published_at is null then now()
        else published_at
      end
  where id = p_article_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    -- Zero rows is RLS refusing, not a missing article: a caller who cannot see it got a
    -- different error above.
    raise exception insufficient_privilege
      using message = 'not permitted to change this article''s status';
  end if;
end;
$$;

grant execute on function
  public.content_transition_article_status(bigint, text) to authenticated;

-- ── Preview by token ──────────────────────────────────────────────────────────
--
-- A preview link has to show an article RLS otherwise hides, to someone who may not be
-- signed in at all. The token is the credential, so these take it as their argument and
-- return nothing at all for one that is unknown or expired.
--
-- Written as two functions over `article` and `article_block` rather than a read policy
-- admitting "any article with a live token", because a policy cannot see which token the
-- request presented — it would make every draft with an outstanding link world-readable.

create or replace function public.content_preview_article(p_token text)
returns setof public.article
language sql
stable
security definer
set search_path = ''
as $$
  select a.*
  from public.article a
  join public.article_preview_token t on t.article_id = a.id
  where t.token = p_token
    and t.expires_at > now()
    and a.deleted_at is null
$$;

create or replace function public.content_preview_blocks(p_token text)
returns setof public.article_block
language sql
stable
security definer
set search_path = ''
as $$
  select b.*
  from public.article_block b
  join public.article_preview_token t on t.article_id = b.article_id
  where t.token = p_token
    and t.expires_at > now()
$$;

grant execute on function public.content_preview_article(text) to anon, authenticated;
grant execute on function public.content_preview_blocks(text) to anon, authenticated;


-- The app's own media RPCs (0005_media_asset_write.sql), superseded by the content module's
-- 03-content-media.sql below. Dropped by exact signature first: the module's create_media_asset and
-- set_media_asset_rights take different argument types, so `create or replace` would add them as
-- overloads beside these, and PostgREST cannot choose between two functions with the same
-- argument names. set_media_asset_copy keeps its signature but gains defaults, so it goes too.
drop function if exists public.create_media_asset(
  text, text, integer, integer, text, boolean, timestamptz, text, text, timestamptz, bigint, text, text, text);
drop function if exists public.set_media_asset_rights(
  bigint, text, boolean, timestamptz, text, text, timestamptz);
drop function if exists public.set_media_asset_copy(bigint, bigint, text, text, text);
drop function if exists public.validate_media_asset_rights(text, boolean, text, text, text);

-- supplemental: 03-content-media.sql
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

-- RLS policies for the i18n tables: locale, local_text_link, local_text
--
-- All three are public-read: the dictionary has to resolve for anonymous visitors
-- on server-rendered pages. Writes are admin-only.
--
-- Admin access is gated on user_account.admin via public.current_user_admin(),
-- not on an identity-provider role claim — which is what keeps this file
-- provider-neutral. The scaffold template supplies that function (SuperPrototype:
-- supabase/supplemental/00-auth-functions.sql, which resolves it from auth.uid()).
-- Any other template has to define public.current_user_admin() and
-- public.current_user_id() with the same signatures before this file runs.
--
-- Helpers are called as (select public.current_user_admin()) so the planner
-- evaluates the STABLE function once per statement rather than once per row, and
-- every policy names its role with `to`. Both are standard Postgres/Supabase RLS
-- practice.

alter table public.locale enable row level security;

drop policy if exists "locale_public_read" on public.locale;
create policy "locale_public_read"
  on public.locale for select
  to anon, authenticated
  using (true);

drop policy if exists "locale_admin_write" on public.locale;
create policy "locale_admin_write"
  on public.locale for all
  to authenticated
  using ((select public.current_user_admin()))
  with check ((select public.current_user_admin()));

-- ────────────────────────────────────────────────────────────────────────────

alter table public.local_text_link enable row level security;

drop policy if exists "local_text_link_public_read" on public.local_text_link;
create policy "local_text_link_public_read"
  on public.local_text_link for select
  to anon, authenticated
  using (true);

drop policy if exists "local_text_link_admin_write" on public.local_text_link;
create policy "local_text_link_admin_write"
  on public.local_text_link for all
  to authenticated
  using ((select public.current_user_admin()))
  with check ((select public.current_user_admin()));

-- ────────────────────────────────────────────────────────────────────────────

alter table public.local_text enable row level security;

drop policy if exists "local_text_public_read" on public.local_text;
create policy "local_text_public_read"
  on public.local_text for select
  to anon, authenticated
  using (true);

drop policy if exists "local_text_admin_write" on public.local_text;
create policy "local_text_admin_write"
  on public.local_text for all
  to authenticated
  using ((select public.current_user_admin()))
  with check ((select public.current_user_admin()));

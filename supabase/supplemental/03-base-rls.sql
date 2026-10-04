-- RLS policies for scaffold-level tables: user_account, navigation_item
--
-- Predicates go through the helpers in 00-auth-functions.sql, which resolve
-- Supabase Auth's auth.uid() to the bigint domain principal. No policy here
-- references auth.uid() or auth.jwt() directly.
--
-- Two conventions every policy below follows, both from Supabase's RLS guidance:
--
--   1. Helpers are called as (select public.current_user_id()), not bare. The
--      subselect lets the planner hoist the STABLE function into an InitPlan
--      evaluated once per statement instead of once per row.
--   2. Every policy names its role with `to`. Without it a policy is also
--      evaluated for anon, which can never satisfy these predicates anyway.
--
-- current_user_admin() replaces the inline
-- `exists (select 1 from public.user_account where id = ... and admin)` this file
-- used to repeat. That subquery was both slower (an RLS-checked read per policy
-- evaluation) and, on user_account itself, a self-reference inside a policy on the
-- same table — which Postgres rejects with "infinite recursion detected in policy
-- for relation". See 00-auth-functions.sql for why the helper is SECURITY DEFINER.

alter table public.user_account enable row level security;

drop policy if exists "user_account_owner_read" on public.user_account;
create policy "user_account_owner_read"
  on public.user_account for select
  to authenticated
  using ((select public.current_user_id()) = id);

drop policy if exists "user_account_owner_update" on public.user_account;
create policy "user_account_owner_update"
  on public.user_account for update
  to authenticated
  using ((select public.current_user_id()) = id)
  with check ((select public.current_user_id()) = id);

drop policy if exists "user_account_admin_all" on public.user_account;
create policy "user_account_admin_all"
  on public.user_account for all
  to authenticated
  using ((select public.current_user_admin()))
  with check ((select public.current_user_admin()));

-- No insert policy, deliberately. Rows are created only by
-- public.ensure_user_account() (SECURITY DEFINER), which derives the auth identity
-- from auth.uid() so a caller cannot provision a principal for someone else.
-- Adding a self-insert policy here would reopen that.

-- ────────────────────────────────────────────────────────────────────────────

alter table public.navigation_item enable row level security;

drop policy if exists "navigation_item_public_read" on public.navigation_item;
create policy "navigation_item_public_read"
  on public.navigation_item for select
  to anon, authenticated
  using (active);

drop policy if exists "navigation_item_admin_write" on public.navigation_item;
create policy "navigation_item_admin_write"
  on public.navigation_item for all
  to authenticated
  using ((select public.current_user_admin()))
  with check ((select public.current_user_admin()));

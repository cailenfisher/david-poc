-- Auth helper functions
--
-- These three functions are the whole bridge between Supabase Auth's identity
-- (auth.users.id, a uuid, reachable in SQL as auth.uid()) and the domain
-- principal (public.user_account.id, a bigint). Every RLS policy in this project
-- goes through current_user_id() or current_user_admin(); no policy references
-- auth.uid() directly, so the mapping lives in exactly one place and swapping
-- identity providers means rewriting these bodies and nothing else.
--
-- This file must sort FIRST among supplemental files (00- prefix): the RLS files
-- that follow call these functions.
--
-- WHY SECURITY DEFINER: each function reads public.user_account, which is itself
-- RLS-protected. As SECURITY INVOKER they would re-enter user_account's own
-- policies — and user_account's admin policy calls current_user_admin(), so a
-- policy would be consulting a function that reads the table the policy is on.
-- Postgres raises "infinite recursion detected in policy for relation" on that.
-- SECURITY DEFINER reads the table without RLS and breaks the cycle; this is the
-- pattern Supabase documents for exactly this case.
--
-- WHY STABLE on the two read-only functions: Postgres evaluates STABLE functions
-- once per statement rather than once per row. Called as
-- (select public.current_user_id()) from a policy, the planner hoists them into
-- an InitPlan evaluated a single time per statement. VOLATILE re-runs per row.
--
-- WHY set search_path = '': a SECURITY DEFINER function otherwise inherits the
-- caller's search_path, letting a caller shadow an unqualified name with their own
-- object and have it execute with the definer's privileges. Every reference below
-- is fully schema-qualified for the same reason.
--
-- Note: there is no `create schema auth` here. On Supabase the auth schema is
-- created and owned by the platform.

-- ── Identity → domain principal ───────────────────────────────────────────────

create or replace function public.current_user_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select ua.id
  from public.user_account ua
  where ua.auth_user_id = (select auth.uid())
$$;

create or replace function public.current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select ua.admin
      from public.user_account ua
      where ua.auth_user_id = (select auth.uid())
    ),
    false
  )
$$;

-- ── Just-in-time provisioning ─────────────────────────────────────────────────
--
-- Creates the domain principal on first sign-in and returns its id.
--
-- The identity comes from auth.uid(), never a parameter: a caller cannot
-- provision or claim a row for somebody else's auth identity.
--
-- The first user_account row ever created is granted admin, because a freshly
-- seeded database has no other route into the admin area. That emptiness check
-- MUST run as definer. Under RLS a brand-new user can see no user_account rows at
-- all, so the same test written in application code reads "table is empty" for
-- every new user and hands admin to everybody. Promote or revoke admins with a
-- direct SQL update after the first one; there is no invite UI.

create or replace function public.ensure_user_account()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_id bigint;
begin
  if v_auth_user_id is null then
    return null;
  end if;

  select ua.id into v_id
  from public.user_account ua
  where ua.auth_user_id = v_auth_user_id;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.user_account (auth_user_id, admin)
  values (v_auth_user_id, not exists (select 1 from public.user_account))
  on conflict (auth_user_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Lost the race with a concurrent request provisioning the same identity.
    select ua.id into v_id
    from public.user_account ua
    where ua.auth_user_id = v_auth_user_id;
  end if;

  return v_id;
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
--
-- anon can call the two read-only helpers (both return null/false with no
-- session, which is what the policies want). ensure_user_account writes, so it is
-- authenticated-only.

grant execute on function public.current_user_id() to authenticated, anon;
grant execute on function public.current_user_admin() to authenticated, anon;
grant execute on function public.ensure_user_account() to authenticated;

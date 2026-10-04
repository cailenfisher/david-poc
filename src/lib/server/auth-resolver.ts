// SuperPrototype auth resolver — resolves the Supabase session to a
// public.user_account.id, the bigint domain principal the rest of the system
// reasons about.
//
// getClaims() rather than getUser(): it verifies the access token's signature
// locally against the project's cached JWKS instead of making a network round trip
// to the Auth server on every single request. getUser() is still the right call
// when something needs a freshly-read auth.users record — see the admin layout,
// which reads the operator's email that way.
//
// Provisioning on first sign-in lives in public.ensure_user_account(), not here.
// Two reasons, both load-bearing:
//   1. It derives the identity from auth.uid(), so a caller cannot provision or
//      claim a principal for someone else's auth identity.
//   2. The "first account ever created becomes admin" check has to see the whole
//      table. Under RLS this code can only see its own row, so the same check
//      written here would read "table is empty" for every new user and grant admin
//      to all of them.

import type { RequestEvent } from '@sveltejs/kit';

export async function resolveAuthenticatedUserId(
  event: RequestEvent,
): Promise<number | null> {
  const { data: claimsData, error: claimsError } =
    await event.locals.supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) return null;

  const { data, error } = await event.locals.supabase.rpc('ensure_user_account');

  if (error) {
    console.error('[auth] ensure_user_account failed:', error);
    return null;
  }

  return data ?? null;
}

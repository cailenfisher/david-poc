import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { toOne } from '$lib/server/postgrest';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.userAccountId) throw redirect(303, '/sign-in');

  // Authentication is not authorization. RLS already refuses a non-admin's reads
  // and writes, but without this check they would reach the admin UI and see it
  // half-populated instead of being told no. user_account_owner_read is what lets
  // a caller read their own row here.
  const { data: account, error: accountError } = await locals.supabase
    .from('user_account')
    .select('admin')
    .eq('id', locals.userAccountId)
    .maybeSingle();

  if (accountError) throw error(500, 'Failed to verify admin access.');
  if (!account?.admin) throw error(403, 'Admin access required.');

  // getUser() rather than getClaims() here on purpose: this reads the live
  // auth.users record for the operator's email, which belongs to the identity
  // layer and is not something a cached token payload should be trusted for.
  const { data: { user } } = await locals.supabase.auth.getUser();

  const { data, error: queryError } = await locals.supabase
    .from('navigation_item')
    .select('id, href, local_text_link(slug, scope)')
    .eq('scope', 'admin')
    .eq('active', true)
    .order('sort_order');

  if (queryError) throw error(500, 'Failed to load admin navigation.');

  const navItems = (data ?? []).map((row) => ({
    id: row.id,
    href: row.href,
    localTextLink: toOne(row.local_text_link),
  }));

  return { navItems, user };
};

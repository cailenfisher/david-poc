import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { toOne } from '$lib/server/postgrest';

export const load: PageServerLoad = async ({ locals }) => {
  const { data, error: queryError } = await locals.supabase
    .from('navigation_item')
    .select('id, href, scope, sort_order, active, local_text_link(id, slug, scope)')
    .order('scope')
    .order('sort_order');

  if (queryError) throw error(500, 'Failed to load navigation items.');

  const navItems = (data ?? []).map((row) => ({
    id: row.id,
    href: row.href,
    scope: row.scope,
    sortOrder: row.sort_order,
    active: row.active,
    localTextLink: toOne(row.local_text_link),
  }));

  return { navItems };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const form = await request.formData();

    const slug = (form.get('slug') as string | null)?.trim();
    const href = (form.get('href') as string | null)?.trim();
    const navScope = (form.get('nav_scope') as string | null)?.trim();
    const sortOrder = parseInt((form.get('sort_order') as string | null) ?? '0') || 0;

    if (!slug || !href || !navScope) {
      return fail(422, { error: 'Slug, URL, and scope are required.' });
    }

    // One RPC: the copy link and the nav item have to land together or a failure
    // leaves an orphaned link behind.
    const { error: rpcError } = await locals.supabase.rpc('create_navigation_item', {
      p_slug: slug,
      p_href: href,
      p_scope: navScope,
      p_sort_order: sortOrder,
    });

    if (rpcError) return fail(500, { error: 'Failed to create navigation item.' });

    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const form = await request.formData();
    const id = parseInt(form.get('id') as string);

    if (isNaN(id)) return fail(422, { error: 'Invalid ID.' });

    const { error: rpcError } = await locals.supabase.rpc('delete_navigation_item', {
      p_id: id,
    });

    if (rpcError) return fail(500, { error: 'Failed to delete navigation item.' });

    return { success: true };
  },
};

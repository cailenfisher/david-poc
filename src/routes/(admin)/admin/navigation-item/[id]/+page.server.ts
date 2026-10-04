import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { LOCALE_COLUMNS, toLocale, toOne } from '$lib/server/postgrest';

export const load: PageServerLoad = async ({ params, locals }) => {
  const id = parseInt(params.id);
  if (isNaN(id)) throw error(404, 'Not found');

  const [navResult, localeResult] = await Promise.all([
    locals.supabase
      .from('navigation_item')
      .select('id, href, scope, sort_order, active, local_text_link(id, slug, scope)')
      .eq('id', id)
      .maybeSingle(),
    locals.supabase
      .from('locale')
      .select(LOCALE_COLUMNS)
      .order('code'),
  ]);

  if (navResult.error || localeResult.error) {
    throw error(500, 'Failed to load navigation item.');
  }
  if (!navResult.data) throw error(404, 'Navigation item not found');

  const linkId = toOne(navResult.data.local_text_link)?.id ?? null;

  const { data: translations, error: translationError } = linkId
    ? await locals.supabase
        .from('local_text')
        .select('id, link, locale, content')
        .eq('link', linkId)
    : { data: [], error: null };

  if (translationError) throw error(500, 'Failed to load translations.');

  return {
    navItem: {
      id: navResult.data.id,
      href: navResult.data.href,
      scope: navResult.data.scope,
      sortOrder: navResult.data.sort_order,
      active: navResult.data.active,
      localTextLink: toOne(navResult.data.local_text_link),
    },
    translations: translations ?? [],
    locales: (localeResult.data ?? []).map(toLocale),
  };
};

export const actions: Actions = {
  update: async ({ params, request, locals }) => {
    const id = parseInt(params.id);
    const form = await request.formData();

    const href = (form.get('href') as string | null)?.trim();
    const scope = (form.get('scope') as string | null)?.trim();
    const sortOrder = parseInt((form.get('sort_order') as string | null) ?? '0') || 0;
    const active = form.get('active') === 'on';

    if (isNaN(id) || !href || !scope) {
      return fail(422, { error: 'URL and scope are required.' });
    }

    const { error: updateError } = await locals.supabase
      .from('navigation_item')
      .update({ href, scope, sort_order: sortOrder, active })
      .eq('id', id);

    if (updateError) return fail(500, { error: 'Failed to update navigation item.' });

    return { success: true };
  },

  updateText: async ({ params, request, locals }) => {
    const navId = parseInt(params.id);
    const form = await request.formData();

    const localeId = parseInt(form.get('locale_id') as string);
    const content = (form.get('content') as string | null)?.trim() ?? '';

    if (isNaN(navId) || isNaN(localeId)) return fail(422, { error: 'Invalid parameters.' });

    // Read-then-write needs no transaction: if the upsert fails nothing changed.
    const { data: navItem, error: readError } = await locals.supabase
      .from('navigation_item')
      .select('local_text_link_id')
      .eq('id', navId)
      .maybeSingle();

    if (readError) return fail(500, { error: 'Failed to load navigation item.' });
    if (!navItem?.local_text_link_id) return fail(404, { error: 'Navigation item not found.' });

    const { error: upsertError } = await locals.supabase
      .from('local_text')
      .upsert(
        { link: navItem.local_text_link_id, locale: localeId, content },
        { onConflict: 'link,locale' },
      );

    if (upsertError) return fail(500, { error: 'Failed to save translation.' });

    return { success: true };
  },

  delete: async ({ params, locals }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return fail(422, { error: 'Invalid ID.' });

    const { error: rpcError } = await locals.supabase.rpc('delete_navigation_item', {
      p_id: id,
    });

    if (rpcError) return fail(500, { error: 'Failed to delete navigation item.' });

    throw redirect(303, '/admin/navigation-item');
  },
};

import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { LOCALE_COLUMNS, toLocale } from '$lib/server/postgrest';

export const load: PageServerLoad = async ({ params, locals }) => {
  const id = parseInt(params.id);
  if (isNaN(id)) throw error(404, 'Not found');

  const [entryResult, translationResult, localeResult] = await Promise.all([
    locals.supabase
      .from('local_text_link')
      .select('id, slug, scope, entity_id')
      .eq('id', id)
      .maybeSingle(),
    locals.supabase
      .from('local_text')
      .select('id, link, locale, content')
      .eq('link', id),
    locals.supabase
      .from('locale')
      .select(LOCALE_COLUMNS)
      .order('code'),
  ]);

  if (entryResult.error || translationResult.error || localeResult.error) {
    throw error(500, 'Failed to load copy entry.');
  }
  if (!entryResult.data) throw error(404, 'Entry not found');

  return {
    entry: {
      id: entryResult.data.id,
      slug: entryResult.data.slug,
      scope: entryResult.data.scope,
      entityId: entryResult.data.entity_id,
    },
    translations: translationResult.data ?? [],
    locales: (localeResult.data ?? []).map(toLocale),
  };
};

export const actions: Actions = {
  update: async ({ params, request, locals }) => {
    const linkId = parseInt(params.id);
    const form = await request.formData();

    const localeId = parseInt(form.get('locale_id') as string);
    const content = (form.get('content') as string | null)?.trim() ?? '';

    if (isNaN(linkId) || isNaN(localeId)) return fail(422, { error: 'Invalid parameters.' });

    // uq_local_text_entry (link, locale) is what makes this an upsert rather than
    // a read-then-write.
    const { error: upsertError } = await locals.supabase
      .from('local_text')
      .upsert({ link: linkId, locale: localeId, content }, { onConflict: 'link,locale' });

    if (upsertError) return fail(500, { error: 'Failed to save translation.' });

    return { success: true };
  },

  delete: async ({ params, locals }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return fail(422, { error: 'Invalid ID.' });

    const { error: rpcError } = await locals.supabase.rpc('delete_local_text_entry', {
      p_link_id: id,
    });

    if (rpcError) return fail(500, { error: 'Failed to delete copy entry.' });

    throw redirect(303, '/admin/local-text');
  },
};

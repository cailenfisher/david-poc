import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { LOCALE_COLUMNS, toLocale } from '$lib/server/postgrest';

export const load: PageServerLoad = async ({ locals }) => {
  const [entryResult, translationResult, localeResult] = await Promise.all([
    locals.supabase
      .from('local_text_link')
      .select('id, slug, scope, entity_id')
      .order('slug'),
    locals.supabase
      .from('local_text')
      .select('id, link, locale, content'),
    locals.supabase
      .from('locale')
      .select(LOCALE_COLUMNS)
      .order('code'),
  ]);

  if (entryResult.error || translationResult.error || localeResult.error) {
    throw error(500, 'Failed to load copy entries.');
  }

  return {
    entries: (entryResult.data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      scope: row.scope,
      entityId: row.entity_id,
    })),
    translations: translationResult.data ?? [],
    locales: (localeResult.data ?? []).map(toLocale),
  };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const form = await request.formData();

    const slug = (form.get('slug') as string | null)?.trim();
    const scope = (form.get('scope') as string | null)?.trim() || null;

    if (!slug) return fail(422, { error: 'Slug is required.' });

    const localeIds = (form.getAll('locale_id') as string[]).map((v) => parseInt(v));
    const contents = form.getAll('content') as string[];

    if (localeIds.some(isNaN)) return fail(422, { error: 'Invalid locale.' });

    // One RPC, not an insert followed by a second insert: the link and its copy
    // have to land in the same transaction or a failure leaves an orphaned slug.
    const { error: rpcError } = await locals.supabase.rpc('create_local_text_entry', {
      p_slug: slug,
      p_scope: scope,
      p_locale_ids: localeIds,
      p_contents: contents,
    });

    if (rpcError) return fail(500, { error: 'Failed to create copy entry.' });

    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const form = await request.formData();
    const id = parseInt(form.get('id') as string);

    if (isNaN(id)) return fail(422, { error: 'Invalid ID.' });

    const { error: rpcError } = await locals.supabase.rpc('delete_local_text_entry', {
      p_link_id: id,
    });

    if (rpcError) return fail(500, { error: 'Failed to delete copy entry.' });

    return { success: true };
  },
};

import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { data, error: queryError } = await locals.supabase
    .from('locale')
    .select('id, code, name, native_name, dir')
    .order('code');

  if (queryError) throw error(500, 'Failed to load locales.');

  const locales = (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    nativeName: row.native_name,
    dir: row.dir,
  }));

  return { locales };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const form = await request.formData();

    const code = (form.get('code') as string | null)?.trim();
    const name = (form.get('name') as string | null)?.trim();
    const nativeName = (form.get('native_name') as string | null)?.trim();
    const dir = (form.get('dir') as string | null)?.trim() || 'ltr';

    if (!code || !name || !nativeName) {
      return fail(422, { error: 'Code, name, and native name are required.' });
    }

    const { error: insertError } = await locals.supabase
      .from('locale')
      .insert({ code, name, native_name: nativeName, dir });

    if (insertError) return fail(500, { error: 'Failed to create locale.' });

    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const form = await request.formData();
    const id = parseInt(form.get('id') as string);

    if (isNaN(id)) return fail(422, { error: 'Invalid ID.' });

    const { error: deleteError } = await locals.supabase
      .from('locale')
      .delete()
      .eq('id', id);

    if (deleteError) return fail(500, { error: 'Failed to delete locale.' });

    return { success: true };
  },
};

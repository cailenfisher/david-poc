import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const id = parseInt(params.id);
  if (isNaN(id)) throw error(404, 'Not found');

  const { data, error: queryError } = await locals.supabase
    .from('locale')
    .select('id, code, name, native_name, dir')
    .eq('id', id)
    .maybeSingle();

  if (queryError) throw error(500, 'Failed to load locale.');
  if (!data) throw error(404, 'Locale not found');

  return {
    locale: {
      id: data.id,
      code: data.code,
      name: data.name,
      nativeName: data.native_name,
      dir: data.dir,
    },
  };
};

export const actions: Actions = {
  update: async ({ params, request, locals }) => {
    const id = parseInt(params.id);
    const form = await request.formData();

    const code = (form.get('code') as string | null)?.trim();
    const name = (form.get('name') as string | null)?.trim();
    const nativeName = (form.get('native_name') as string | null)?.trim();
    const dir = (form.get('dir') as string | null)?.trim() || 'ltr';

    if (isNaN(id) || !code || !name || !nativeName) {
      return fail(422, { error: 'Code, name, and native name are required.' });
    }

    const { error: updateError } = await locals.supabase
      .from('locale')
      .update({ code, name, native_name: nativeName, dir })
      .eq('id', id);

    if (updateError) return fail(500, { error: 'Failed to update locale.' });

    return { success: true };
  },

  delete: async ({ params, locals }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return fail(422, { error: 'Invalid ID.' });

    const { error: deleteError } = await locals.supabase
      .from('locale')
      .delete()
      .eq('id', id);

    if (deleteError) return fail(500, { error: 'Failed to delete locale.' });

    throw redirect(303, '/admin/locale');
  },
};

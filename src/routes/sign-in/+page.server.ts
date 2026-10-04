import { redirect, fail } from '@sveltejs/kit';
import { PUBLIC_SITE_URL } from '$env/static/public';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.userAccountId) throw redirect(303, '/admin/dashboard');
  return { dev };
};

export const actions: Actions = {
  google: async ({ locals }) => {
    const { data, error } = await locals.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${PUBLIC_SITE_URL}/auth/callback`,
      },
    });

    if (error || !data.url) {
      return fail(500, { error: 'Could not initiate Google sign-in.' });
    }

    throw redirect(303, data.url);
  },

  // POC-ONLY. Email/password sign-in so the admin area is reachable without
  // completing a Google OAuth round trip. Guarded by `dev` so it cannot be
  // reached in a production build. Not part of the SvelteBuilder scaffold.
  password: async ({ locals, request }) => {
    if (!dev) return fail(404, { error: 'Not available.' });

    const form = await request.formData();
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');

    if (!email || !password) {
      return fail(400, { error: 'Email and password are both required.' });
    }

    const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

    if (error) return fail(401, { error: error.message });

    throw redirect(303, '/admin/dashboard');
  },
};

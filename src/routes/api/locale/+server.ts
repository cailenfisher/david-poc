import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Locale } from 'diglossia';

// public.locale is world-readable (locale_public_read), so these run fine with no
// session on the publishable key.

export const GET: RequestHandler = async ({ locals }) => {
  const { data, error } = await locals.supabase
    .from('locale')
    .select('id, code, name, native_name, dir')
    .order('name');

  if (error) {
    console.error('[locale] query error:', error);
    return json([] satisfies Locale[], { status: 200 });
  }

  const locales: Locale[] = (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    nativeName: row.native_name,
    dir: row.dir as 'ltr' | 'rtl',
  }));

  return json(locales);
};

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const formData = await request.formData();
  const code = formData.get('code');

  if (!code || typeof code !== 'string') {
    return json({ error: 'Invalid locale code' }, { status: 400 });
  }

  const { data } = await locals.supabase
    .from('locale')
    .select('code')
    .eq('code', code)
    .maybeSingle();

  const resolvedCode = data?.code ?? locals.defaultLocale.code;

  cookies.set('locale', resolvedCode, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: true,
  });

  const referer = request.headers.get('referer') ?? '/';
  redirect(303, referer);
};

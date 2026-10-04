import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { PUBLIC_DEFAULT_LOCALE } from '$env/static/public';
import { resolveAuthenticatedUserId } from '$lib/server/auth-resolver';
import { providerHandle } from '$lib/server/auth-handle';

// Translates the provider's user identity to a public.user_account.id and attaches
// it to locals. Route code reads locals.userAccountId for guards and gets its data
// through locals.supabase, whose RLS context comes from the request's own session.
const populateLocals: Handle = async ({ event, resolve }) => {
  event.locals.userAccountId = await resolveAuthenticatedUserId(event);
  return resolve(event);
};

// public.locale carries a world-readable policy (locale_public_read), so this runs
// on the publishable key with no session and needs no privileged client.
const localeHook: Handle = async ({ event, resolve }) => {
  const defaultCode = PUBLIC_DEFAULT_LOCALE ?? 'en';

  const { data, error } = await event.locals.supabase
    .from('locale')
    .select('id, code, name, native_name, dir')
    .order('code');

  // Degrade to the hardcoded default rather than 500 the whole site, but say so —
  // an empty locale list is otherwise a confusing thing to debug.
  if (error) console.error('[locale] query error:', error);

  const available = (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    nativeName: row.native_name,
    dir: row.dir as 'ltr' | 'rtl',
  }));

  const defaultLocale = available.find((l) => l.code === defaultCode)
    ?? available[0]
    ?? { id: 0, code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' as const };

  const cookieCode = event.cookies.get('locale');

  const headerCode = event.request.headers
    .get('accept-language')
    ?.split(',')[0]
    ?.split(';')[0]
    ?.trim();

  const resolvedCode = cookieCode ?? headerCode ?? defaultCode;

  event.locals.locale = available.find((l) => l.code === resolvedCode) ?? defaultLocale;
  event.locals.defaultLocale = defaultLocale;

  return resolve(event);
};

export const handle = sequence(providerHandle, populateLocals, localeHook);

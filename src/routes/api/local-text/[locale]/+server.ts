import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DictionaryPayload } from 'diglossia';
import { toDictionaryPayload, type DictionaryRow } from '$lib/server/postgrest';

// get_dictionary is STABLE + SECURITY INVOKER: locale-priority resolution happens
// in SQL, and the public-read policies on the three i18n tables are what make it
// readable without a session.

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const { locale: localeCode } = params;
  const defaultCode = url.searchParams.get('fallback') ?? locals.defaultLocale.code;

  const { data, error } = await locals.supabase.rpc('get_dictionary', {
    user_locale_code: localeCode,
    fallback_locale_code: defaultCode,
    scope_filter: null,
    entity_id_filter: null,
  });

  if (error) {
    console.error('[local-text] global query error:', error);
    return json([] satisfies DictionaryPayload, { status: 200 });
  }

  const payload = toDictionaryPayload(data as DictionaryRow[] | null);

  return json(payload);
};

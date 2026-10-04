import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DictionaryPayload } from 'diglossia';
import { toDictionaryPayload, type DictionaryRow } from '$lib/server/postgrest';

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const { locale: localeCode, scope } = params;
  const defaultCode = url.searchParams.get('fallback') ?? locals.defaultLocale.code;

  const { data, error } = await locals.supabase.rpc('get_dictionary', {
    user_locale_code: localeCode,
    fallback_locale_code: defaultCode,
    scope_filter: scope,
    entity_id_filter: null,
  });

  if (error) {
    console.error(`[local-text] scope query error (${scope}):`, error);
    return json([] satisfies DictionaryPayload, { status: 200 });
  }

  const payload = toDictionaryPayload(data as DictionaryRow[] | null);

  return json(payload);
};

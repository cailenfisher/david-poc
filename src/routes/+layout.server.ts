import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, fetch }) => {
  const { locale, defaultLocale } = locals;

  const [dictionaryResponse, localesResponse] = await Promise.all([
    fetch(`/api/local-text/${locale.code}`),
    fetch('/api/locale'),
  ]);

  const dictionary = await dictionaryResponse.json();
  const locales = await localesResponse.json();

  return {
    locale,
    defaultLocale,
    dictionary,
    locales,
  };
};

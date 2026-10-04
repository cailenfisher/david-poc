import { createDictionary } from 'diglossia';
import { generateNewsSitemap } from '@sveltebuilder/content/publishing';
import { loadFeedArticles } from '../feed-articles';
import type { RequestHandler } from './$types';

// Google News only indexes the last two days, and the generator filters on that itself, so the
// limit here is a ceiling rather than the window.
const NEWS_SITEMAP_LIMIT = 1000;

export const GET: RequestHandler = async ({ locals, url }) => {
  const { articles, publisher, copy } = await loadFeedArticles(
    locals.supabase,
    locals.locale.code,
    locals.defaultLocale.code,
    NEWS_SITEMAP_LIMIT
  );

  const dictionary = createDictionary(copy);

  // Google requires the publication name on every entry, so a news sitemap without a publisher
  // profile has nothing valid to emit — better an explicit 404 than a feed Google rejects.
  if (publisher === null) {
    return new Response('No publisher profile configured.', { status: 404 });
  }

  const xml = generateNewsSitemap(articles, dictionary, {
    siteUrl: url.origin,
    locale: locals.locale.code,
    publicationName: dictionary.localText('name', 'publisher_profile', publisher.id),
  });

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
    },
  });
};

import { createDictionary } from 'diglossia';
import { generateRssFeed } from '@sveltebuilder/content/publishing';
import { loadFeedArticles } from '../feed-articles';
import type { RequestHandler } from './$types';

// The most recent 50, which is what a feed reader wants. No published/embargo predicate here:
// RLS applies it, and a crawler arrives with no session, so this endpoint sees exactly what an
// anonymous reader would.
const FEED_LIMIT = 50;

export const GET: RequestHandler = async ({ locals, url }) => {
  const { articles, publisher, copy } = await loadFeedArticles(
    locals.supabase,
    locals.locale.code,
    locals.defaultLocale.code,
    FEED_LIMIT
  );

  // A request-scoped instance: an endpoint has no component context to read a dictionary from,
  // and a module-level one would be shared across concurrent requests and leak one visitor's
  // locale into another's feed.
  const dictionary = createDictionary(copy);

  // The feed titles itself after the publication. With no publisher profile seeded there is no
  // publication name to use, so the slug's own fallback stands in rather than the feed shipping
  // an empty <title>.
  const feedTitle = publisher
    ? dictionary.localText('name', 'publisher_profile', publisher.id)
    : dictionary.localText('content.feed.title', 'content');

  const xml = generateRssFeed(articles, dictionary, {
    siteUrl: url.origin,
    locale: locals.locale.code,
    feedTitle,
    feedDescription: dictionary.localText('content.feed.description', 'content'),
  });

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800',
    },
  });
};

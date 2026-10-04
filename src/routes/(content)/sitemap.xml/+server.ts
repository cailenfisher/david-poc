import {
  generateStandardSitemap,
  getArticleSitemapEntries,
} from '@sveltebuilder/content/publishing';
import { loadFeedArticles } from '../feed-articles';
import type { RequestHandler } from './$types';

// A sitemap wants everything, not a page of it. 1000 is the ceiling a single sitemap file should
// carry before it is split into an index — worth revisiting with a sitemap index when a
// publisher outgrows it, rather than silently truncating.
const SITEMAP_LIMIT = 1000;

export const GET: RequestHandler = async ({ locals, url }) => {
  // No dictionary: a standard sitemap carries URLs and timestamps, no copy.
  const { articles } = await loadFeedArticles(
    locals.supabase,
    locals.locale.code,
    locals.defaultLocale.code,
    SITEMAP_LIMIT
  );

  const xml = generateStandardSitemap(getArticleSitemapEntries(articles, { siteUrl: url.origin }));

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

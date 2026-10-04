// Shared by the three feed endpoints in this bundle.
//
// Colocated in the routes tree rather than in $lib, because it belongs to these three routes
// and nothing else: a scaffold without the content module would have a helper querying tables
// it does not have. SvelteKit only treats `+page`, `+layout`, `+server` and `+error` as
// special, so an ordinary module here is simply not a route — which is the idiomatic place for
// code three sibling routes share.
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DictionaryPayload } from 'diglossia';
import type { ArticleRow } from '@sveltebuilder/content/views';
import type { PublisherProfile } from '@sveltebuilder/content';

const toOne = <T>(embed: T | T[] | null): T | null =>
  embed === null ? null : Array.isArray(embed) ? (embed[0] ?? null) : embed;

const ARTICLE_COLUMNS =
  'id, article_status_id, canonical_slug, published_at, updated_at, deleted_at, embargo_until, allow_comment, created_at, article_status!inner(id, slug, ordinal), article_byline(position, author_profile(id, user_account_id, slug, active, created_at)), article_section(section(id, parent_section_id, slug, ordinal, active, created_at)), article_topic(topic(id, slug, active, created_at)), article_tag(tag(id, slug, active, created_at))';

/**
 * The most recently published articles, newest first, with the copy needed to render them.
 *
 * No published/embargo/deleted predicate: RLS applies it. These endpoints are read by
 * crawlers with no session at all, so they run as `anon` and see exactly what a reader would —
 * which is the property worth having, since a feed that leaked an embargoed story would leak
 * it to Google first.
 */
export async function loadFeedArticles(
  supabase: SupabaseClient,
  localeCode: string,
  fallbackCode: string,
  limit: number
): Promise<{
  articles: ArticleRow[];
  /** Null when none is seeded; a feed then has no title to give itself. */
  publisher: PublisherProfile | null;
  copy: DictionaryPayload;
}> {
  const [{ data, error }, publisherResult] = await Promise.all([
    supabase
      .from('article')
      .select(ARTICLE_COLUMNS)
      .order('published_at', { ascending: false })
      .limit(limit),
    // The feeds title themselves after the publication, so its identity is part of this.
    supabase
      .from('publisher_profile')
      .select('id, logo_media_asset_id, url, created_at')
      .limit(1)
      .maybeSingle(),
  ]);

  if (error) throw error;
  if (publisherResult.error) throw publisherResult.error;

  const articles: ArticleRow[] = [];
  for (const row of data ?? []) {
    const status = toOne(row.article_status);
    if (status === null) continue;

    articles.push({
      id: row.id,
      articleStatusId: row.article_status_id,
      canonicalSlug: row.canonical_slug,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      embargoUntil: row.embargo_until,
      allowComment: row.allow_comment,
      createdAt: row.created_at,
      status: { id: status.id, slug: status.slug, ordinal: status.ordinal },
      bylines: (row.article_byline ?? [])
        .map((byline) => ({ position: byline.position, author: toOne(byline.author_profile) }))
        .filter(
          (byline): byline is { position: number; author: NonNullable<typeof byline.author> } =>
            byline.author !== null
        )
        .sort((a, b) => a.position - b.position)
        .map(({ author }) => ({
          id: author.id,
          userAccountId: author.user_account_id,
          slug: author.slug,
          active: author.active,
          createdAt: author.created_at,
        })),
      sections: (row.article_section ?? [])
        .map((entry) => toOne(entry.section))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .map((entry) => ({
          id: entry.id,
          parentSectionId: entry.parent_section_id,
          slug: entry.slug,
          ordinal: entry.ordinal,
          active: entry.active,
          createdAt: entry.created_at,
        })),
      topics: (row.article_topic ?? [])
        .map((entry) => toOne(entry.topic))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .map((entry) => ({
          id: entry.id,
          slug: entry.slug,
          active: entry.active,
          createdAt: entry.created_at,
        })),
      tags: (row.article_tag ?? [])
        .map((entry) => toOne(entry.tag))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .map((entry) => ({
          id: entry.id,
          slug: entry.slug,
          active: entry.active,
          createdAt: entry.created_at,
        })),
    });
  }

  const copy = await loadEntityCopy(
    supabase,
    [
      { scope: 'article', ids: articles.map((article) => article.id) },
      {
        scope: 'author_profile',
        ids: articles.flatMap((article) => article.bylines.map((author) => author.id)),
      },
      {
        scope: 'section',
        ids: articles.flatMap((article) => article.sections.map((entry) => entry.id)),
      },
      { scope: 'tag', ids: articles.flatMap((article) => article.tags.map((entry) => entry.id)) },
      { scope: 'publisher_profile', ids: publisherResult.data ? [publisherResult.data.id] : [] },
    ],
    localeCode,
    fallbackCode
  );

  // The feed's own description is application-level copy, not entity-bound, so it comes from
  // the module's scope rather than by id.
  const uiCopy = await loadScopedCopy(supabase, ['content'], localeCode, fallbackCode);

  return {
    articles,
    publisher: publisherResult.data
      ? {
          id: publisherResult.data.id,
          logoMediaAssetId: publisherResult.data.logo_media_asset_id,
          url: publisherResult.data.url,
          createdAt: publisherResult.data.created_at,
        }
      : null,
    copy: [...uiCopy, ...copy],
  };
}

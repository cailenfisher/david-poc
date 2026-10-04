import type { ArticleRow } from '@sveltebuilder/content/views';

// POC ADDITION. Shared by the front, author and topic loaders — an ordinary module beside
// the routes in the tree rather than in $lib, because a scaffold without the content
// module would also receive $lib. Same placement as (content)/feed-articles.ts.

/** supabase-js types every embed as an array, having no way to know the cardinality. */
export const toOne = <T>(embed: T | T[] | null): T | null =>
  embed === null ? null : Array.isArray(embed) ? (embed[0] ?? null) : embed;

/** The article columns and embeds an ArticleRow needs, as a PostgREST select list. */
export const ARTICLE_COLUMNS =
  'id, article_status_id, canonical_slug, published_at, updated_at, deleted_at, embargo_until, allow_comment, created_at, article_status!inner(id, slug, ordinal), article_byline(position, author_profile(id, user_account_id, slug, active, created_at)), article_section(section(id, parent_section_id, slug, ordinal, active, created_at)), article_topic(topic(id, slug, active, created_at)), article_tag(tag(id, slug, active, created_at))';

/**
 * The shape PostgREST returns for ARTICLE_COLUMNS. Hand-written because the scaffold's
 * `locals.supabase` is a bare SupabaseClient with no Database generic, so nothing types
 * a query result — every shipped loader maps these rows by hand for the same reason.
 * Embeds arrive as object-or-array and go through toOne, which is where that
 * ambiguity actually gets resolved.
 */

type RawArticle = {
  id: number;
  article_status_id: number;
  canonical_slug: string;
  published_at: string | null;
  updated_at: string;
  deleted_at: string | null;
  embargo_until: string | null;
  allow_comment: boolean;
  created_at: string;
  article_status: { id: number; slug: string; ordinal: number } | { id: number; slug: string; ordinal: number }[] | null;
  article_byline?: Array<{ position: number; author_profile: RawAuthor | RawAuthor[] | null }>;
  article_section?: Array<{ section: RawSection | RawSection[] | null }>;
  article_topic?: Array<{ topic: RawSlugged | RawSlugged[] | null }>;
  article_tag?: Array<{ tag: RawSlugged | RawSlugged[] | null }>;
};

type RawAuthor = {
  id: number;
  user_account_id: number | null;
  slug: string;
  active: boolean;
  created_at: string;
};

type RawSection = {
  id: number;
  parent_section_id: number | null;
  slug: string;
  ordinal: number;
  active: boolean;
  created_at: string;
};

type RawSlugged = { id: number; slug: string; active: boolean; created_at: string };

/**
 * Maps one PostgREST article row to an ArticleRow, or null when its status embed is
 * unreadable. Returning null rather than throwing lets a caller skip the row: on the
 * front that is the correct response to a slot whose article RLS has hidden.
 */
export function toArticleRow(row: RawArticle): ArticleRow | null {
  const status = toOne(row.article_status);
  if (status === null) return null;

  return {
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
    // Byline order is editorial: position 1 is the lead name.
    bylines: (row.article_byline ?? [])
      .map((byline) => ({ position: byline.position, author: toOne(byline.author_profile) }))
      .filter(
        (byline): byline is { position: number; author: RawAuthor } => byline.author !== null
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
      .filter((entry): entry is RawSection => entry !== null)
      .map((entry) => ({
        id: entry.id,
        parentSectionId: entry.parent_section_id,
        slug: entry.slug,
        ordinal: entry.ordinal,
        active: entry.active,
        createdAt: entry.created_at,
      }))
      .sort((a, b) => a.ordinal - b.ordinal),
    topics: (row.article_topic ?? [])
      .map((entry) => toOne(entry.topic))
      .filter((entry): entry is RawSlugged => entry !== null)
      .map((entry) => ({
        id: entry.id,
        slug: entry.slug,
        active: entry.active,
        createdAt: entry.created_at,
      })),
    tags: (row.article_tag ?? [])
      .map((entry) => toOne(entry.tag))
      .filter((entry): entry is RawSlugged => entry !== null)
      .map((entry) => ({
        id: entry.id,
        slug: entry.slug,
        active: entry.active,
        createdAt: entry.created_at,
      })),
  };
}

export type { RawArticle };

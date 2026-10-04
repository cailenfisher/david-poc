import { error } from '@sveltejs/kit';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { ArticleRow, SectionPageView } from '@sveltebuilder/content/views';
import type { PageServerLoad } from './$types';

// A public page with no auth guard: which articles a reader sees is decided entirely by the
// module's RLS policies. See supabase/supplemental/02-content-rls.sql.

const PER_PAGE = 20;

const toOne = <T>(embed: T | T[] | null): T | null =>
  embed === null ? null : Array.isArray(embed) ? (embed[0] ?? null) : embed;

export const load: PageServerLoad = async ({ locals, params, url }): Promise<SectionPageView> => {
  const pageParam = Number(url.searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const from = (page - 1) * PER_PAGE;

  const sectionResult = await locals.supabase
    .from('section')
    .select('id, parent_section_id, slug, ordinal, active, created_at')
    .eq('slug', params.slug)
    .maybeSingle();

  if (sectionResult.error) throw error(500, 'Failed to load the section.');
  if (!sectionResult.data) throw error(404, 'Section not found.');

  const section = {
    id: sectionResult.data.id,
    parentSectionId: sectionResult.data.parent_section_id,
    slug: sectionResult.data.slug,
    ordinal: sectionResult.data.ordinal,
    active: sectionResult.data.active,
    createdAt: sectionResult.data.created_at,
  };

  // Articles are reached through the join table rather than filtered on the article table,
  // because the relationship is many-to-many: an article can be filed in several sections.
  // `count: 'exact'` on the same query gives the total without a second round trip.
  const [articlesResult, childResult] = await Promise.all([
    locals.supabase
      .from('article_section')
      .select(
        'article!inner(id, article_status_id, canonical_slug, published_at, updated_at, deleted_at, embargo_until, allow_comment, created_at, article_status!inner(id, slug, ordinal), article_byline(position, author_profile(id, user_account_id, slug, active, created_at)), article_section(section(id, parent_section_id, slug, ordinal, active, created_at)), article_topic(topic(id, slug, active, created_at)), article_tag(tag(id, slug, active, created_at)))',
        { count: 'exact' }
      )
      .eq('section_id', section.id)
      .order('published_at', { ascending: false, referencedTable: 'article' })
      .range(from, from + PER_PAGE - 1),
    locals.supabase
      .from('section')
      .select('id, parent_section_id, slug, ordinal, active, created_at')
      .eq('parent_section_id', section.id)
      .eq('active', true)
      .order('ordinal'),
  ]);

  if (articlesResult.error) throw error(500, 'Failed to load the section’s articles.');
  if (childResult.error) throw error(500, 'Failed to load child sections.');

  const articles: ArticleRow[] = [];
  for (const link of articlesResult.data ?? []) {
    // !inner on the embed means an article RLS hides drops the join row too, so an
    // unpublished article never appears here as a null.
    const row = toOne(link.article);
    if (row === null) continue;

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

  const childSections = (childResult.data ?? []).map((child) => ({
    id: child.id,
    parentSectionId: child.parent_section_id,
    slug: child.slug,
    ordinal: child.ordinal,
    active: child.active,
    createdAt: child.created_at,
  }));

  const [uiCopy, entityCopy] = await Promise.all([
    loadScopedCopy(locals.supabase, ['content'], locals.locale.code, locals.defaultLocale.code),
    // By id, not by scope: 'article' is unbounded, so a whole-scope load would ship every
    // headline in the database to render one page of twenty.
    loadEntityCopy(
      locals.supabase,
      [
        { scope: 'article', ids: articles.map((article) => article.id) },
        { scope: 'article_status', ids: articles.map((article) => article.status.id) },
        {
          scope: 'author_profile',
          ids: articles.flatMap((article) => article.bylines.map((author) => author.id)),
        },
        {
          scope: 'section',
          ids: [
            section.id,
            ...childSections.map((child) => child.id),
            ...articles.flatMap((article) => article.sections.map((entry) => entry.id)),
          ],
        },
        {
          scope: 'topic',
          ids: articles.flatMap((article) => article.topics.map((entry) => entry.id)),
        },
      ],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ]);

  return {
    section,
    childSections,
    articles,
    total: articlesResult.count ?? articles.length,
    page,
    perPage: PER_PAGE,
    localeCode: locals.locale.code,
    copy: [...uiCopy, ...entityCopy],
  };
};

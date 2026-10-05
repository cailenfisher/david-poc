import { error } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import { selectLeadMediaAssetId } from '@sveltebuilder/content/publishing';
import type { ArticleRow, SectionPageView } from '@sveltebuilder/content/views';
import type { PageServerLoad } from './$types';

// A public page with no auth guard: which articles a reader sees is decided entirely by the
// module's RLS policies. See supabase/supplemental/02-content-rls.sql.

const PER_PAGE = 20;

const STORAGE_BASE_URL = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

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
        'article!inner(id, article_status_id, canonical_slug, published_at, updated_at, deleted_at, embargo_until, allow_comment, lead_media_asset_id, created_at, article_status!inner(id, slug, ordinal), article_block(id, article_id, block_type, position, content, media_asset_id, created_at), article_byline(position, author_profile(id, user_account_id, slug, active, created_at)), article_section(section(id, parent_section_id, slug, ordinal, active, created_at)), article_topic(topic(id, slug, active, created_at)), article_tag(tag(id, slug, active, created_at)))',
        { count: 'exact' }
      )
      .eq('section_id', section.id)
      // Only image blocks come back for each article: a card needs the first picture, not the
      // body. The filter narrows the embedded rows and leaves every article in the page.
      .eq('article.article_block.block_type', 'image')
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
      leadMediaAssetId: row.lead_media_asset_id,
      createdAt: row.created_at,
      blocks: (row.article_block ?? [])
        .map((block) => ({
          id: block.id,
          articleId: block.article_id,
          blockType: block.block_type,
          position: block.position,
          content: block.content,
          mediaAssetId: block.media_asset_id,
          createdAt: block.created_at,
        }))
        .sort((a, b) => a.position - b.position),
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

  // Each card's lead image, resolved by the same rule the article page uses (the editor's
  // choice, else the first image block). Only those assets are fetched, not every block's.
  const leadAssetIds = [
    ...new Set(
      articles
        .map((article) => selectLeadMediaAssetId({ ...article, blocks: article.blocks ?? [] }))
        .filter((lead): lead is NonNullable<typeof lead> => lead !== null)
        .map((lead) => lead.mediaAssetId)
    ),
  ];
  const mediaResult =
    leadAssetIds.length > 0
      ? await locals.supabase
          .from('media_asset')
          .select('id, media_type, storage_key, width, height, mime_type, uploaded_by, created_at')
          .in('id', leadAssetIds)
      : { data: [], error: null };
  if (mediaResult.error) throw error(500, 'Failed to load media.');

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
    storageBaseUrl: STORAGE_BASE_URL,
    mediaAssets: (mediaResult.data ?? []).map((asset) => ({
      id: asset.id,
      mediaType: asset.media_type,
      storageKey: asset.storage_key,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mime_type,
      uploadedBy: asset.uploaded_by,
      createdAt: asset.created_at,
    })),
    total: articlesResult.count ?? articles.length,
    page,
    perPage: PER_PAGE,
    localeCode: locals.locale.code,
    copy: [...uiCopy, ...entityCopy],
  };
};

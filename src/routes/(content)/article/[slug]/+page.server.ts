import { error, fail } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { ArticleWithBlocks } from '@sveltebuilder/content/views';
import type { ArticlePageWithCoverage } from './coverage-view';
import type { Actions, PageServerLoad } from './$types';

// No auth guard: this is a public page. What a reader may see is decided entirely by the
// module's RLS policies — a draft, an embargoed article and a soft-deleted one are all
// invisible to anon, so this loader does not re-implement that rule. See the module's
// supabase/supplemental/02-content-rls.sql.

const ARTICLE_COLUMNS =
  'id, article_status_id, canonical_slug, published_at, updated_at, deleted_at, embargo_until, allow_comment, created_at, article_status!inner(id, slug, ordinal), article_block(id, article_id, block_type, position, content, media_asset_id, created_at), article_byline(position, author_profile(id, user_account_id, slug, active, created_at)), article_section(section(id, parent_section_id, slug, ordinal, active, created_at)), article_topic(topic(id, slug, active, created_at)), article_tag(tag(id, slug, active, created_at))';

const toOne = <T>(embed: T | T[] | null): T | null =>
  embed === null ? null : Array.isArray(embed) ? (embed[0] ?? null) : embed;

// Where a storageKey resolves to a URL. Supabase-specific, which is why it comes from the
// loader rather than the screen: the screen is flavour-neutral and should not know.
const STORAGE_BASE_URL = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

export const load: PageServerLoad = async ({
  locals,
  params,
  url,
}): Promise<ArticlePageWithCoverage> => {
  const articleResult = await locals.supabase
    .from('article')
    .select(ARTICLE_COLUMNS)
    .eq('canonical_slug', params.slug)
    .maybeSingle();

  if (articleResult.error) throw error(500, 'Failed to load the article.');
  // Null covers both "no such slug" and "RLS refused it", which is the same answer either
  // way: a reader who may not see a draft should not learn that it exists.
  if (!articleResult.data) throw error(404, 'Article not found.');

  const row = articleResult.data;

  const blocks = (row.article_block ?? [])
    .map((block) => ({
      id: block.id,
      articleId: block.article_id,
      blockType: block.block_type,
      position: block.position,
      content: block.content,
      mediaAssetId: block.media_asset_id,
      createdAt: block.created_at,
    }))
    .sort((a, b) => a.position - b.position);

  // Byline order is editorial: the first name is the lead, so the position column is the
  // sort, not the author's id or name.
  const bylines = (row.article_byline ?? [])
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
    }));

  const sections = (row.article_section ?? [])
    .map((link) => toOne(link.section))
    .filter((section): section is NonNullable<typeof section> => section !== null)
    .map((section) => ({
      id: section.id,
      parentSectionId: section.parent_section_id,
      slug: section.slug,
      ordinal: section.ordinal,
      active: section.active,
      createdAt: section.created_at,
    }))
    .sort((a, b) => a.ordinal - b.ordinal);

  const topics = (row.article_topic ?? [])
    .map((link) => toOne(link.topic))
    .filter((topic): topic is NonNullable<typeof topic> => topic !== null)
    .map((topic) => ({
      id: topic.id,
      slug: topic.slug,
      active: topic.active,
      createdAt: topic.created_at,
    }));

  const tags = (row.article_tag ?? [])
    .map((link) => toOne(link.tag))
    .filter((tag): tag is NonNullable<typeof tag> => tag !== null)
    .map((tag) => ({ id: tag.id, slug: tag.slug, active: tag.active, createdAt: tag.created_at }));

  // !inner, so an article whose status row is unreadable does not come back at all rather than
  // arriving with a null status the mapping would have to invent a value for.
  const status = toOne(row.article_status);
  if (status === null) throw error(500, 'Article has no status.');

  const article: ArticleWithBlocks = {
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
    blocks,
    bylines,
    sections,
    topics,
    tags,
  };

  const mediaAssetIds = [
    ...new Set(blocks.map((block) => block.mediaAssetId).filter((id): id is number => id !== null)),
  ];

  const [commentsResult, publisherResult, mediaResult, coverageResult, uiCopy, entityCopy] = await Promise.all([
    // RLS already restricts this to approved comments on publicly visible articles, so the
    // only filter here is the article, and the status predicate is not repeated.
    article.allowComment
      ? locals.supabase
          .from('comment')
          .select(
            'id, article_id, user_account_id, parent_comment_id, author_name, author_email, body, status, created_at, updated_at'
          )
          .eq('article_id', article.id)
          .order('created_at')
      : Promise.resolve({ data: [], error: null }),
    locals.supabase
      .from('publisher_profile')
      .select('id, logo_media_asset_id, url, created_at')
      .limit(1)
      .maybeSingle(),
    // Only the assets this article's blocks actually reference.
    mediaAssetIds.length > 0
      ? locals.supabase
          .from('media_asset')
          .select('id, media_type, storage_key, width, height, mime_type, uploaded_by, created_at')
          .in('id', mediaAssetIds)
      : Promise.resolve({ data: [], error: null }),
    // POC ADDITION: the live coverage thread, if this article has one. Its own RLS gates
    // it on the article being publicly visible, so no status predicate is repeated here.
    // Updates come back newest-last and LiveCoverageView does its own pinned/regular split.
    locals.supabase
      .from('live_coverage')
      .select(
        'id, article_id, active, started_at, ended_at, live_update(id, live_coverage_id, published_at, pinned, position, created_at)'
      )
      .eq('article_id', article.id)
      .maybeSingle(),
    // 'publisher_profile' loaded by scope rather than by id: it is a singleton, so the scope
    // is bounded, and asking for it by id would mean referencing the publisher query's own
    // result from inside the Promise.all that defines it.
    loadScopedCopy(
      locals.supabase,
      ['content', 'publisher_profile'],
      locals.locale.code,
      locals.defaultLocale.code
    ),
    // Entity copy by id rather than by scope: 'article' is unbounded, so loading the whole
    // scope would ship every headline in the database to render one page.
    loadEntityCopy(
      locals.supabase,
      [
        { scope: 'article', ids: [article.id] },
        { scope: 'article_status', ids: [status.id] },
        { scope: 'article_block', ids: blocks.map((block) => block.id) },
        { scope: 'author_profile', ids: bylines.map((author) => author.id) },
        { scope: 'section', ids: sections.map((section) => section.id) },
        { scope: 'topic', ids: topics.map((topic) => topic.id) },
        { scope: 'tag', ids: tags.map((tag) => tag.id) },
        { scope: 'media_asset', ids: mediaAssetIds },
      ],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ]);

  if (commentsResult.error) throw error(500, 'Failed to load comments.');
  if (mediaResult.error) throw error(500, 'Failed to load media.');
  if (coverageResult.error) throw error(500, 'Failed to load live coverage.');

  // POC ADDITION. Shaped for LiveCoverageView, which is Camp 2: the `text` on each
  // update is part of LiveUpdateWithCopy but the component resolves the real string
  // from the dictionary by update id, so it is left empty rather than invented here.
  const coverageRow = coverageResult.data;
  const liveCoverage = coverageRow
    ? {
        id: coverageRow.id,
        articleId: coverageRow.article_id,
        active: coverageRow.active,
        startedAt: coverageRow.started_at,
        endedAt: coverageRow.ended_at,
        updates: (coverageRow.live_update ?? [])
          .map((update) => ({
            id: update.id,
            liveCoverageId: update.live_coverage_id,
            publishedAt: update.published_at,
            pinned: update.pinned,
            position: update.position,
            createdAt: update.created_at,
            text: '',
          }))
          .sort((a, b) => b.position - a.position),
      }
    : null;

  // A second copy load rather than a seventh entry in the one above: the coverage ids
  // are not known until that query resolves. It costs a round trip only on an article
  // that actually has a thread, which most do not.
  const coverageCopy = liveCoverage
    ? await loadEntityCopy(
        locals.supabase,
        [
          { scope: 'live_coverage', ids: [liveCoverage.id] },
          { scope: 'live_update', ids: liveCoverage.updates.map((update) => update.id) },
        ],
        locals.locale.code,
        locals.defaultLocale.code
      )
    : [];

  return {
    article,
    comments: (commentsResult.data ?? []).map((comment) => ({
      id: comment.id,
      articleId: comment.article_id,
      userAccountId: comment.user_account_id,
      parentCommentId: comment.parent_comment_id,
      authorName: comment.author_name,
      authorEmail: comment.author_email,
      body: comment.body,
      status: comment.status,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
    })),
    publisherProfile: publisherResult.data
      ? {
          id: publisherResult.data.id,
          logoMediaAssetId: publisherResult.data.logo_media_asset_id,
          url: publisherResult.data.url,
          createdAt: publisherResult.data.created_at,
        }
      : null,
    canonicalUrl: `${url.origin}/article/${article.canonicalSlug}`,
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
    localeCode: locals.locale.code,
    liveCoverage,
    copy: [...uiCopy, ...entityCopy, ...coverageCopy],
  };
};

export const actions: Actions = {
  // One insert, so a plain call. Three things make this safe without the route checking any
  // of them, and all three are RLS rather than application logic: a comment may only be
  // inserted as pending, only against an article that is publicly visible, and only when that
  // article accepts comments. The status is not read from the form at all.
  comment: async ({ locals, params, request }) => {
    const form = await request.formData();
    const authorName = (form.get('author_name') as string | null)?.trim();
    const authorEmail = (form.get('author_email') as string | null)?.trim();
    const body = (form.get('body') as string | null)?.trim();

    if (!authorName || !authorEmail || !body) {
      return fail(422, { error: 'Name, email and comment are all required.' });
    }

    const articleResult = await locals.supabase
      .from('article')
      .select('id')
      .eq('canonical_slug', params.slug)
      .maybeSingle();

    if (articleResult.error) throw error(500, 'Failed to load the article.');
    if (!articleResult.data) throw error(404, 'Article not found.');

    const { error: insertError } = await locals.supabase.from('comment').insert({
      article_id: articleResult.data.id,
      user_account_id: locals.userAccountId,
      author_name: authorName,
      author_email: authorEmail,
      body,
      status: 'pending',
    });

    if (insertError) {
      // 42501 is insufficient_privilege: the insert policy refused it, which here means the
      // article does not accept comments. That is an answer to the reader, not a fault.
      if (insertError.code === '42501') {
        return fail(403, { error: 'This article is not accepting comments.' });
      }
      return fail(500, { error: 'Failed to submit your comment.' });
    }

    return { success: true as const };
  },
};

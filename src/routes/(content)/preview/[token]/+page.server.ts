import { error } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { ArticleBlock } from '@sveltebuilder/content';
import type { PreviewPageView } from '@sveltebuilder/content/views';
import type { PageServerLoad } from './$types';

// The token is the credential, and this route presents it to two SECURITY DEFINER functions
// rather than reading the article directly. RLS hides an unpublished article, and a policy
// cannot see which token a request carried — admitting "any article with a live token" would
// make every draft with an outstanding preview link world-readable. See the module's
// supabase/supplemental/02-content-rls.sql.
//
// Nothing here checks expiry or existence: both functions return no rows for a token that is
// unknown or expired, which is why an invalid token and a missing article are the same 404.

const STORAGE_BASE_URL = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

// supabase-js infers a row type from a `.select()` string literal, but an `.rpc()` call is just
// a function name — it has no way to know what comes back without generated database types, so
// it types the result as `{}`. These two shapes mirror what the functions return, which is
// `setof article` and `setof article_block`: the tables' own columns, snake_case.
type PreviewArticleRow = {
  id: number;
  article_status_id: number;
  canonical_slug: string;
  published_at: string | null;
  updated_at: string;
  deleted_at: string | null;
  embargo_until: string | null;
  allow_comment: boolean;
  created_at: string;
};

type PreviewBlockRow = {
  id: number;
  article_id: number;
  block_type: ArticleBlock['blockType'];
  position: number;
  content: ArticleBlock['content'];
  media_asset_id: number | null;
  created_at: string;
};

export const load: PageServerLoad = async ({ locals, params }): Promise<PreviewPageView> => {
  const [articleResult, blocksResult] = await Promise.all([
    locals.supabase.rpc('content_preview_article', { p_token: params.token }).maybeSingle(),
    locals.supabase.rpc('content_preview_blocks', { p_token: params.token }),
  ]);

  if (articleResult.error) throw error(500, 'Failed to load the preview.');
  if (blocksResult.error) throw error(500, 'Failed to load the preview.');
  if (!articleResult.data) throw error(404, 'Preview not found, or the link has expired.');

  const row = articleResult.data as PreviewArticleRow;

  const blocks = ((blocksResult.data ?? []) as PreviewBlockRow[])
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

  // The relations are read normally rather than through the token, because none of them is
  // secret: a status, a byline and a section leak nothing about an unpublished story's content.
  // The join tables' own read policies gate them on the article being public, so for a draft
  // these come back empty — a preview shows the body, not the filing.
  const [statusResult, mediaResult, uiCopy] = await Promise.all([
    locals.supabase
      .from('article_status')
      .select('id, slug, ordinal')
      .eq('id', row.article_status_id)
      .maybeSingle(),
    (() => {
      const ids = [
        ...new Set(blocks.map((b) => b.mediaAssetId).filter((id): id is number => id !== null)),
      ];
      return ids.length > 0
        ? locals.supabase
            .from('media_asset')
            .select(
              'id, media_type, storage_key, width, height, mime_type, uploaded_by, created_at'
            )
            .in('id', ids)
        : Promise.resolve({ data: [], error: null });
    })(),
    loadScopedCopy(locals.supabase, ['content'], locals.locale.code, locals.defaultLocale.code),
  ]);

  if (statusResult.error) throw error(500, 'Failed to load the article status.');
  if (mediaResult.error) throw error(500, 'Failed to load media.');

  const entityCopy = await loadEntityCopy(
    locals.supabase,
    [
      { scope: 'article', ids: [row.id] },
      { scope: 'article_block', ids: blocks.map((block) => block.id) },
      { scope: 'article_status', ids: statusResult.data ? [statusResult.data.id] : [] },
      {
        scope: 'media_asset',
        ids: (mediaResult.data ?? []).map((asset) => asset.id),
      },
    ],
    locals.locale.code,
    locals.defaultLocale.code
  );

  return {
    article: {
      id: row.id,
      articleStatusId: row.article_status_id,
      canonicalSlug: row.canonical_slug,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      embargoUntil: row.embargo_until,
      allowComment: row.allow_comment,
      createdAt: row.created_at,
      status: statusResult.data
        ? {
            id: statusResult.data.id,
            slug: statusResult.data.slug,
            ordinal: statusResult.data.ordinal,
          }
        : // article_status is world-readable, so this is unreachable in practice; the shape is
          // satisfied rather than asserted so a missing row cannot crash a preview.
          { id: row.article_status_id, slug: 'draft', ordinal: 0 },
      blocks,
      bylines: [],
      sections: [],
      topics: [],
      tags: [],
    },
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
    copy: [...uiCopy, ...entityCopy],
  };
};

import { error, fail } from '@sveltejs/kit';
import { createDictionary } from 'diglossia';
import { validateArticleForPublish } from '@sveltebuilder/content/publishing';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  buildStorageKey,
  detectImageMimeType,
  parseRightsFields,
  readImageDimensions,
} from '$lib/server/media-upload';
import type { MediaAssetWithRights } from '$lib/types/media-asset';
import type { ChecklistEntry } from '@sveltebuilder/content/views';
import type { ArticleEditorView } from './editor-view';
import type { Actions, PageServerLoad } from './$types';

// Where a storageKey resolves to a URL; the same base the public article page uses.
const STORAGE_BASE_URL = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

// How many recent assets the editor's picker offers, besides the ones the article uses.
const PICKER_ASSET_COUNT = 24;

const MEDIA_ASSET_COLUMNS =
  'id, media_type, storage_key, width, height, mime_type, uploaded_by, created_at, media_asset_rights(id, media_asset_id, license, credit_required, expires_at, created_at), media_asset_source(id, media_asset_id, source_url, license_url, retrieved_at, created_at)';

const toOne = <T>(embed: T | T[] | null): T | null =>
  embed === null ? null : Array.isArray(embed) ? (embed[0] ?? null) : embed;

export const load: PageServerLoad = async ({ locals, params }): Promise<ArticleEditorView> => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, 'Not found.');

  const [articleResult, statusesResult, checklistResult, stateResult, taxonomyResults] =
    await Promise.all([
      locals.supabase
        .from('article')
        .select(
          'id, article_status_id, canonical_slug, published_at, updated_at, deleted_at, embargo_until, allow_comment, created_at, article_status!inner(id, slug, ordinal), article_block(id, article_id, block_type, position, content, media_asset_id, created_at), article_byline(position, author_profile(id, user_account_id, slug, active, created_at)), article_section(section(id, parent_section_id, slug, ordinal, active, created_at)), article_topic(topic(id, slug, active, created_at)), article_tag(tag(id, slug, active, created_at))'
        )
        .eq('id', id)
        .maybeSingle(),
      locals.supabase.from('article_status').select('id, slug, ordinal').order('ordinal'),
      locals.supabase
        .from('publish_checklist_item')
        .select('id, slug, ordinal, required')
        .order('ordinal'),
      locals.supabase
        .from('article_checklist_state')
        .select('publish_checklist_item_id, satisfied')
        .eq('article_id', id),
      Promise.all([
        locals.supabase
          .from('section')
          .select('id, parent_section_id, slug, ordinal, active, created_at')
          .eq('active', true)
          .order('ordinal'),
        locals.supabase.from('topic').select('id, slug, active, created_at').eq('active', true),
        locals.supabase.from('tag').select('id, slug, active, created_at'),
        locals.supabase
          .from('author_profile')
          .select('id, user_account_id, slug, active, created_at')
          .eq('active', true)
          .order('slug'),
      ]),
    ]);

  if (articleResult.error) throw error(500, 'Failed to load the article.');
  if (!articleResult.data) throw error(404, 'Article not found.');
  if (statusesResult.error) throw error(500, 'Failed to load statuses.');
  if (checklistResult.error) throw error(500, 'Failed to load the publish checklist.');
  if (stateResult.error) throw error(500, 'Failed to load the checklist state.');

  const [sectionsResult, topicsResult, tagsResult, authorsResult] = taxonomyResults;
  if (sectionsResult.error || topicsResult.error || tagsResult.error) {
    throw error(500, 'Failed to load taxonomy.');
  }

  const row = articleResult.data;
  const status = toOne(row.article_status);
  if (status === null) throw error(500, 'Article has no status.');

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
    .map((entry) => toOne(entry.section))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({
      id: entry.id,
      parentSectionId: entry.parent_section_id,
      slug: entry.slug,
      ordinal: entry.ordinal,
      active: entry.active,
      createdAt: entry.created_at,
    }));

  const topics = (row.article_topic ?? [])
    .map((entry) => toOne(entry.topic))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      active: entry.active,
      createdAt: entry.created_at,
    }));

  const tags = (row.article_tag ?? [])
    .map((entry) => toOne(entry.tag))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      active: entry.active,
      createdAt: entry.created_at,
    }));

  // An item with no state row is unsatisfied: never having ticked a box is the common case, not
  // a missing record, which is why this is a map lookup with a false default rather than a join.
  const satisfied = new Map(
    (stateResult.data ?? []).map((state) => [state.publish_checklist_item_id, state.satisfied])
  );

  const checklist: ChecklistEntry[] = (checklistResult.data ?? []).map((item) => ({
    id: item.id,
    slug: item.slug,
    ordinal: item.ordinal,
    required: item.required,
    completed: satisfied.get(item.id) ?? false,
  }));

  const mediaAssets = await loadMediaAssets(
    locals,
    blocks.map((block) => block.mediaAssetId).filter((assetId): assetId is number => assetId !== null)
  );

  const [uiCopy, entityCopy] = await Promise.all([
    loadScopedCopy(locals.supabase, ['content'], locals.locale.code, locals.defaultLocale.code),
    loadEntityCopy(
      locals.supabase,
      [
        { scope: 'article', ids: [row.id] },
        { scope: 'article_block', ids: blocks.map((block) => block.id) },
        { scope: 'media_asset', ids: mediaAssets.map((asset) => asset.id) },
        { scope: 'article_status', ids: (statusesResult.data ?? []).map((s) => s.id) },
        { scope: 'publish_checklist_item', ids: checklist.map((item) => item.id) },
        // Every selectable author, not just the current bylines: the byline picker
        // lists them all and would otherwise show slugs for the unbylined ones.
        {
          scope: 'author_profile',
          ids: [
            ...bylines.map((author) => author.id),
            ...(authorsResult.data ?? []).map((author) => author.id),
          ],
        },
        {
          scope: 'section',
          ids: (sectionsResult.data ?? []).map((section) => section.id),
        },
        { scope: 'topic', ids: (topicsResult.data ?? []).map((topic) => topic.id) },
        { scope: 'tag', ids: (tagsResult.data ?? []).map((tag) => tag.id) },
      ],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ]);

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
      status: { id: status.id, slug: status.slug, ordinal: status.ordinal },
      blocks,
      bylines,
      sections,
      topics,
      tags,
    },
    statuses: (statusesResult.data ?? []).map((s) => ({
      id: s.id,
      slug: s.slug,
      ordinal: s.ordinal,
    })),
    checklist,
    availableSections: (sectionsResult.data ?? []).map((section) => ({
      id: section.id,
      parentSectionId: section.parent_section_id,
      slug: section.slug,
      ordinal: section.ordinal,
      active: section.active,
      createdAt: section.created_at,
    })),
    availableTopics: (topicsResult.data ?? []).map((topic) => ({
      id: topic.id,
      slug: topic.slug,
      active: topic.active,
      createdAt: topic.created_at,
    })),
    availableTags: (tagsResult.data ?? []).map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      active: tag.active,
      createdAt: tag.created_at,
    })),
    availableAuthors: (authorsResult.data ?? []).map((author) => ({
      id: author.id,
      userAccountId: author.user_account_id,
      slug: author.slug,
      active: author.active,
      createdAt: author.created_at,
    })),
    mediaAssets,
    storageBaseUrl: STORAGE_BASE_URL,
    localeCode: locals.locale.code,
    copy: [...uiCopy, ...entityCopy],
  };
};

export const actions: Actions = {
  // Moving through the workflow. Two gates, deliberately in different places.
  //
  // The required-checklist gate is in content_transition_article_status, because it must not be
  // bypassable by posting this form directly. The editorial checks — a headline inside Google's
  // length limit, a dek, a byline, a section, text in every prose block, alt text on every image
  // — run here, because they need a dictionary to resolve the copy and the answer depends on
  // which locale is being published. SQL has no dictionary.
  transition: async ({ locals, params, request }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) throw error(404, 'Not found.');

    const form = await request.formData();
    const statusSlug = (form.get('status_slug') as string | null)?.trim();
    if (!statusSlug) return fail(422, { error: 'Choose a status.' });

    if (statusSlug === 'published') {
      const { article, publisher, copy } = await loadArticleForValidation(locals, id);
      if (article === null) throw error(404, 'Article not found.');

      try {
        validateArticleForPublish(article, publisher, createDictionary(copy));
      } catch (validationError) {
        return fail(422, {
          error:
            validationError instanceof Error
              ? validationError.message
              : 'This article is not ready to publish.',
        });
      }
    }

    const { error: rpcError } = await locals.supabase.rpc('content_transition_article_status', {
      p_article_id: id,
      p_status_slug: statusSlug,
    });

    if (rpcError) {
      if (rpcError.code === '42501') {
        return fail(403, { error: 'Not permitted to change this article’s status.' });
      }
      // The function raises with the unsatisfied item slugs, which is more useful to an editor
      // than a generic failure.
      return fail(422, { error: rpcError.message });
    }

    return { success: true as const };
  },

  // One upsert. The unique index on (article_id, publish_checklist_item_id) is what makes this a
  // single statement rather than a read-then-insert-or-update.
  checklist: async ({ locals, params, request }) => {
    const articleId = Number(params.id);
    if (!Number.isInteger(articleId)) throw error(404, 'Not found.');

    const form = await request.formData();
    const itemId = Number(form.get('item_id'));
    const satisfied = form.get('satisfied') === 'true';

    if (!Number.isInteger(itemId)) return fail(422, { error: 'Invalid checklist item.' });

    const { error: upsertError } = await locals.supabase.from('article_checklist_state').upsert(
      {
        article_id: articleId,
        publish_checklist_item_id: itemId,
        satisfied,
        satisfied_at: satisfied ? new Date().toISOString() : null,
      },
      { onConflict: 'article_id,publish_checklist_item_id' }
    );

    if (upsertError) return fail(500, { error: 'Failed to update the checklist.' });

    return { success: true as const };
  },
  // ── POC ADDITIONS: the editor ───────────────────────────────────────────────
  //
  // Every write below goes through event.locals.supabase, so the content module's
  // admin-write policies decide whether it is allowed — none of these re-check the
  // caller's role. The RPCs are SECURITY INVOKER for exactly that reason: they buy
  // atomicity across statements, not privilege.
  //
  // 42501 is insufficient_privilege, which here means a policy refused the write.
  // That is an answer to report, not a fault to log as a 500.

  /** Headline and dek, for one locale. */
  copy: async ({ locals, params, request }) => {
    const articleId = Number(params.id);
    if (!Number.isInteger(articleId)) return fail(422, { error: 'Invalid article.' });

    const form = await request.formData();
    const localeId = Number(form.get('locale_id'));
    if (!Number.isInteger(localeId)) return fail(422, { error: 'Invalid locale.' });

    const headline = String(form.get('headline') ?? '');
    const dek = String(form.get('dek') ?? '');

    if (!headline.trim()) return fail(422, { error: 'A headline is required.' });

    for (const [slug, content] of [
      ['headline', headline],
      ['dek', dek],
    ] as const) {
      const { error: rpcError } = await locals.supabase.rpc('set_entity_copy', {
        p_slug: slug,
        p_scope: 'article',
        p_entity_id: articleId,
        p_locale_id: localeId,
        p_content: content,
      });

      if (rpcError) {
        if (rpcError.code === '42501') return fail(403, { error: 'Not allowed to edit this copy.' });
        return fail(500, { error: `Failed to save the ${slug}.` });
      }
    }

    return { success: true as const };
  },

  /** Creates a block when block_id is absent, updates it when present. */
  block_save: async ({ locals, params, request }) => {
    const articleId = Number(params.id);
    if (!Number.isInteger(articleId)) return fail(422, { error: 'Invalid article.' });

    const form = await request.formData();
    const localeId = Number(form.get('locale_id'));
    const blockType = String(form.get('block_type') ?? 'paragraph');
    const text = String(form.get('text') ?? '');
    const rawBlockId = form.get('block_id');
    const blockId = rawBlockId ? Number(rawBlockId) : null;
    const rawMediaAssetId = form.get('media_asset_id');
    const mediaAssetId = rawMediaAssetId ? Number(rawMediaAssetId) : null;

    if (!Number.isInteger(localeId)) return fail(422, { error: 'Invalid locale.' });
    if (blockId !== null && !Number.isInteger(blockId)) {
      return fail(422, { error: 'Invalid block.' });
    }
    // An image block has no prose: its copy is on the asset. Every other type is prose.
    if (blockType === 'image') {
      if (mediaAssetId === null || !Number.isInteger(mediaAssetId)) {
        return fail(422, { error: 'Choose an image.' });
      }
    } else if (!text.trim()) {
      return fail(422, { error: 'Block text is required.' });
    }

    // A heading's level lives in the block's own jsonb, not in copy — it is
    // structure. Everything else this editor creates carries no structure yet.
    const level = Number(form.get('level') ?? 2);
    const content = blockType === 'heading' ? { level: level === 3 || level === 4 ? level : 2 } : {};

    const { error: rpcError } = await locals.supabase.rpc('upsert_article_block', {
      p_article_id: articleId,
      p_block_type: blockType,
      p_text: text,
      p_locale_id: localeId,
      p_block_id: blockId,
      p_content: content,
      p_media_asset_id: blockType === 'image' ? mediaAssetId : null,
    });

    if (rpcError) {
      if (rpcError.code === '42501') return fail(403, { error: 'Not allowed to edit this body.' });
      return fail(500, { error: 'Failed to save the block.' });
    }

    return { success: true as const };
  },

  /** Uploads an image and writes its asset, rights, source and copy together. */
  media_create: async ({ locals, request }) => {
    const form = await request.formData();
    const file = form.get('file');
    const localeId = Number(form.get('locale_id'));
    const altText = String(form.get('alt_text') ?? '');
    const caption = String(form.get('caption') ?? '');
    const credit = String(form.get('credit') ?? '');

    if (!(file instanceof File) || file.size === 0) return fail(422, { error: 'Choose an image file.' });
    if (file.size > MAX_IMAGE_BYTES) {
      return fail(422, { error: `The image must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller.` });
    }
    if (!Number.isInteger(localeId)) return fail(422, { error: 'Invalid locale.' });

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Both the declared type and what the bytes say must be an allowed image, and agree.
    // The declared type is client-supplied, so it alone proves nothing.
    const detectedMimeType = detectImageMimeType(bytes);
    if (
      !(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type) ||
      detectedMimeType !== file.type
    ) {
      return fail(422, { error: 'The file must be a JPEG, PNG, WebP or AVIF image.' });
    }

    let dimensions: { width: number; height: number };
    try {
      dimensions = readImageDimensions(bytes);
    } catch {
      return fail(422, { error: 'The image could not be read.' });
    }

    if (!altText.trim()) return fail(422, { error: 'Alt text is required.' });

    const parsed = parseRightsFields(form);
    if (parsed.error !== undefined) return fail(422, { error: parsed.error, field: parsed.field });
    const { rights } = parsed;

    if (rights.creditRequired && !credit.trim()) {
      return fail(422, { error: 'This license requires a credit.', field: 'credit' });
    }

    const storageKey = buildStorageKey(file.type);
    // The bucket-relative path: storage_key carries the bucket name, upload() does not.
    const pathInsideBucket = storageKey.slice('media/'.length);

    const { error: uploadError } = await locals.supabase.storage
      .from('media')
      .upload(pathInsideBucket, bytes, { contentType: file.type, upsert: false });

    if (uploadError) {
      if ('statusCode' in uploadError && (uploadError.statusCode === '403' || uploadError.statusCode === '401')) {
        return fail(403, { error: 'Not allowed to upload images.' });
      }
      return fail(500, { error: 'Failed to upload the image.' });
    }

    const { data: mediaAssetId, error: rpcError } = await locals.supabase.rpc('create_media_asset', {
      p_storage_key: storageKey,
      p_mime_type: file.type,
      p_width: dimensions.width,
      p_height: dimensions.height,
      p_license: rights.license,
      p_credit_required: rights.creditRequired,
      p_expires_at: rights.expiresAt ?? undefined,
      p_source_url: rights.sourceUrl,
      p_license_url: rights.licenseUrl ?? undefined,
      p_retrieved_at: rights.retrievedAt,
      p_locale_id: localeId,
      p_alt_text: altText,
      p_caption: caption,
      p_credit: credit,
    });

    if (rpcError) {
      // A failed save must not leave an orphaned file behind.
      await locals.supabase.storage.from('media').remove([pathInsideBucket]);
      if (rpcError.code === '42501') return fail(403, { error: 'Not allowed to add images.' });
      return fail(422, { error: rpcError.message });
    }

    return { success: true as const, mediaAssetId };
  },

  /** One locale's alt text, caption and credit for an existing asset. */
  media_copy: async ({ locals, request }) => {
    const form = await request.formData();
    const mediaAssetId = Number(form.get('media_asset_id'));
    const localeId = Number(form.get('locale_id'));
    if (!Number.isInteger(mediaAssetId)) return fail(422, { error: 'Invalid image.' });
    if (!Number.isInteger(localeId)) return fail(422, { error: 'Invalid locale.' });

    const altText = String(form.get('alt_text') ?? '');
    if (!altText.trim()) return fail(422, { error: 'Alt text is required.' });

    const { error: rpcError } = await locals.supabase.rpc('set_media_asset_copy', {
      p_media_asset_id: mediaAssetId,
      p_locale_id: localeId,
      p_alt_text: altText,
      p_caption: String(form.get('caption') ?? ''),
      p_credit: String(form.get('credit') ?? ''),
    });

    if (rpcError) {
      if (rpcError.code === '42501') return fail(403, { error: 'Not allowed to edit this image.' });
      return fail(422, { error: rpcError.message });
    }

    return { success: true as const };
  },

  /** License, expiry and provenance for an existing asset. */
  media_rights: async ({ locals, request }) => {
    const form = await request.formData();
    const mediaAssetId = Number(form.get('media_asset_id'));
    if (!Number.isInteger(mediaAssetId)) return fail(422, { error: 'Invalid image.' });

    const parsed = parseRightsFields(form);
    if (parsed.error !== undefined) return fail(422, { error: parsed.error, field: parsed.field });
    const { rights } = parsed;

    const { error: rpcError } = await locals.supabase.rpc('set_media_asset_rights', {
      p_media_asset_id: mediaAssetId,
      p_license: rights.license,
      p_credit_required: rights.creditRequired,
      p_expires_at: rights.expiresAt ?? undefined,
      p_source_url: rights.sourceUrl,
      p_license_url: rights.licenseUrl ?? undefined,
      p_retrieved_at: rights.retrievedAt,
    });

    if (rpcError) {
      if (rpcError.code === '42501') return fail(403, { error: 'Not allowed to edit this image.' });
      return fail(422, { error: rpcError.message });
    }

    return { success: true as const };
  },

  block_delete: async ({ locals, request }) => {
    const form = await request.formData();
    const blockId = Number(form.get('block_id'));
    if (!Number.isInteger(blockId)) return fail(422, { error: 'Invalid block.' });

    const { error: rpcError } = await locals.supabase.rpc('delete_article_block', {
      p_block_id: blockId,
    });

    if (rpcError) {
      if (rpcError.code === '42501') return fail(403, { error: 'Not allowed to edit this body.' });
      return fail(500, { error: 'Failed to delete the block.' });
    }

    return { success: true as const };
  },

  /** Moves one block up or down by swapping it with its neighbour. */
  block_move: async ({ locals, params, request }) => {
    const articleId = Number(params.id);
    const form = await request.formData();
    const blockId = Number(form.get('block_id'));
    const direction = String(form.get('direction') ?? '');

    if (!Number.isInteger(articleId) || !Number.isInteger(blockId)) {
      return fail(422, { error: 'Invalid block.' });
    }
    if (direction !== 'up' && direction !== 'down') {
      return fail(422, { error: 'Invalid direction.' });
    }

    // Read the current order, move the one block, and write the whole ordering back.
    // Sending the full list is what makes this safe to retry: the result depends on
    // the submitted order, not on how many times it has been applied.
    const { data, error: readError } = await locals.supabase
      .from('article_block')
      .select('id, position')
      .eq('article_id', articleId)
      .order('position');

    if (readError) return fail(500, { error: 'Failed to read the body order.' });

    const ids = (data ?? []).map((block) => block.id);
    const index = ids.indexOf(blockId);
    if (index === -1) return fail(404, { error: 'Block not found.' });

    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) return { success: true as const };

    [ids[index], ids[target]] = [ids[target], ids[index]];

    const { error: rpcError } = await locals.supabase.rpc('reorder_article_blocks', {
      p_article_id: articleId,
      p_block_ids: ids,
    });

    if (rpcError) {
      if (rpcError.code === '42501') return fail(403, { error: 'Not allowed to edit this body.' });
      return fail(500, { error: 'Failed to reorder the body.' });
    }

    return { success: true as const };
  },

  /** Replaces the byline list, in the submitted order. */
  bylines: async ({ locals, params, request }) => {
    const articleId = Number(params.id);
    if (!Number.isInteger(articleId)) return fail(422, { error: 'Invalid article.' });

    const form = await request.formData();
    const authorIds = form
      .getAll('author_id')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));

    const { error: rpcError } = await locals.supabase.rpc('set_article_bylines', {
      p_article_id: articleId,
      p_author_ids: authorIds,
    });

    if (rpcError) {
      if (rpcError.code === '42501') return fail(403, { error: 'Not allowed to edit bylines.' });
      return fail(500, { error: 'Failed to save the bylines.' });
    }

    return { success: true as const };
  },

  /** Replaces sections, topics and tags together — they are one form. */
  filing: async ({ locals, params, request }) => {
    const articleId = Number(params.id);
    if (!Number.isInteger(articleId)) return fail(422, { error: 'Invalid article.' });

    const form = await request.formData();
    const ids = (field: string) =>
      form
        .getAll(field)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value));

    const { error: rpcError } = await locals.supabase.rpc('set_article_filing', {
      p_article_id: articleId,
      p_section_ids: ids('section_id'),
      p_topic_ids: ids('topic_id'),
      p_tag_ids: ids('tag_id'),
    });

    if (rpcError) {
      if (rpcError.code === '42501') return fail(403, { error: 'Not allowed to edit filing.' });
      return fail(500, { error: 'Failed to save the filing.' });
    }

    return { success: true as const };
  },

  /** Slug, embargo, comment policy. One row, so a plain update rather than an RPC. */
  publishing: async ({ locals, params, request }) => {
    const articleId = Number(params.id);
    if (!Number.isInteger(articleId)) return fail(422, { error: 'Invalid article.' });

    const form = await request.formData();
    const slug = String(form.get('canonical_slug') ?? '').trim();
    const embargo = String(form.get('embargo_until') ?? '').trim();
    const allowComment = form.get('allow_comment') === 'true';

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return fail(422, { error: 'The slug must be lowercase words separated by hyphens.' });
    }

    // datetime-local submits without a zone. Treating it as the server's zone would
    // make an embargo mean something different depending on where this runs, so it is
    // parsed as UTC and the form says so.
    const embargoUntil = embargo ? new Date(`${embargo}:00Z`).toISOString() : null;
    if (embargo && Number.isNaN(Date.parse(`${embargo}:00Z`))) {
      return fail(422, { error: 'Invalid embargo date.' });
    }

    // .select() so an update RLS filtered to zero rows is reported rather than
    // reading as a successful save.
    const { data: saved, error: updateError } = await locals.supabase
      .from('article')
      .update({
        canonical_slug: slug,
        embargo_until: embargoUntil,
        allow_comment: allowComment,
      })
      .eq('id', articleId)
      .select('id');

    if (!updateError && (saved ?? []).length === 0) {
      return fail(403, { error: 'Not allowed to edit this article.' });
    }

    if (updateError) {
      if (updateError.code === '23505' || updateError.code === '23514') {
        return fail(422, { error: 'That slug is already taken.' });
      }
      if (updateError.code === '42501') {
        return fail(403, { error: 'Not allowed to edit this article.' });
      }
      return fail(500, { error: 'Failed to save publishing settings.' });
    }

    return { success: true as const };
  },
};

/**
 * The assets this article's blocks use plus the most recent uploads, for the picker, each with
 * its rights and source. Both of those tables are admin-only, which is why the editor, and
 * not the public page, is where they are read.
 */
async function loadMediaAssets(
  locals: App.Locals,
  articleAssetIds: number[]
): Promise<MediaAssetWithRights[]> {
  const [recentResult, usedResult] = await Promise.all([
    locals.supabase
      .from('media_asset')
      .select(MEDIA_ASSET_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(PICKER_ASSET_COUNT),
    articleAssetIds.length > 0
      ? locals.supabase.from('media_asset').select(MEDIA_ASSET_COLUMNS).in('id', articleAssetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (recentResult.error || usedResult.error) throw error(500, 'Failed to load images.');

  const byId = new Map<number, NonNullable<typeof recentResult.data>[number]>();
  for (const asset of [...(recentResult.data ?? []), ...(usedResult.data ?? [])]) {
    byId.set(asset.id, asset);
  }

  return [...byId.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((asset) => {
      const rights = toOne(asset.media_asset_rights);
      const source = toOne(asset.media_asset_source);
      return {
        id: asset.id,
        mediaType: asset.media_type,
        storageKey: asset.storage_key,
        width: asset.width,
        height: asset.height,
        mimeType: asset.mime_type,
        uploadedBy: asset.uploaded_by,
        createdAt: asset.created_at,
        rights: rights && {
          id: rights.id,
          mediaAssetId: rights.media_asset_id,
          license: rights.license,
          creditRequired: rights.credit_required,
          expiresAt: rights.expires_at,
          createdAt: rights.created_at,
        },
        source: source && {
          id: source.id,
          mediaAssetId: source.media_asset_id,
          sourceUrl: source.source_url,
          licenseUrl: source.license_url,
          retrievedAt: source.retrieved_at,
          createdAt: source.created_at,
        },
      };
    });
}

async function loadArticleForValidation(locals: App.Locals, id: number) {
  const [articleResult, publisherResult] = await Promise.all([
    locals.supabase
      .from('article')
      .select(
        'id, article_status_id, canonical_slug, published_at, updated_at, deleted_at, embargo_until, allow_comment, created_at, article_block(id, article_id, block_type, position, content, media_asset_id, created_at), article_byline(position, author_profile(id, user_account_id, slug, active, created_at)), article_section(section(id, parent_section_id, slug, ordinal, active, created_at)), article_topic(topic(id, slug, active, created_at)), article_tag(tag(id, slug, active, created_at))'
      )
      .eq('id', id)
      .maybeSingle(),
    locals.supabase
      .from('publisher_profile')
      .select('id, logo_media_asset_id, url, created_at')
      .limit(1)
      .maybeSingle(),
  ]);

  if (articleResult.error || !articleResult.data) {
    return { article: null, publisher: null, copy: [] };
  }

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

  const article = {
    id: row.id,
    articleStatusId: row.article_status_id,
    canonicalSlug: row.canonical_slug,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    embargoUntil: row.embargo_until,
    allowComment: row.allow_comment,
    createdAt: row.created_at,
    blocks,
    bylines: (row.article_byline ?? [])
      .map((byline) => toOne(byline.author_profile))
      .filter((author): author is NonNullable<typeof author> => author !== null)
      .map((author) => ({
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
  };

  const mediaAssetIds = blocks
    .map((block) => block.mediaAssetId)
    .filter((assetId): assetId is number => assetId !== null);

  const copy = await loadEntityCopy(
    locals.supabase,
    [
      { scope: 'article', ids: [article.id] },
      { scope: 'article_block', ids: blocks.map((block) => block.id) },
      { scope: 'media_asset', ids: mediaAssetIds },
      { scope: 'publisher_profile', ids: publisherResult.data ? [publisherResult.data.id] : [] },
    ],
    locals.locale.code,
    locals.defaultLocale.code
  );

  return {
    article,
    publisher: publisherResult.data
      ? {
          id: publisherResult.data.id,
          logoMediaAssetId: publisherResult.data.logo_media_asset_id,
          url: publisherResult.data.url,
          createdAt: publisherResult.data.created_at,
        }
      : null,
    copy,
  };
}

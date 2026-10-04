import { error, fail, redirect } from '@sveltejs/kit';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { AdminArticleListView, ArticleRow } from '@sveltebuilder/content/views';
import type { Actions, PageServerLoad } from './$types';

// Guards live in the (admin) layout load; RLS refuses these writes for a non-admin regardless.
// Note what this means for the list: an admin sees every article at every status, because the
// article admin policy is `for all`, while the public read policy only admits published ones.
// The same query run by a reader would return a different set, which is the point.

const PER_PAGE = 20;

const toOne = <T>(embed: T | T[] | null): T | null =>
  embed === null ? null : Array.isArray(embed) ? (embed[0] ?? null) : embed;

const ARTICLE_COLUMNS =
  'id, article_status_id, canonical_slug, published_at, updated_at, deleted_at, embargo_until, allow_comment, created_at, article_status!inner(id, slug, ordinal), article_byline(position, author_profile(id, user_account_id, slug, active, created_at)), article_section(section(id, parent_section_id, slug, ordinal, active, created_at)), article_topic(topic(id, slug, active, created_at)), article_tag(tag(id, slug, active, created_at))';

export const load: PageServerLoad = async ({ locals, url }): Promise<AdminArticleListView> => {
  const statusSlug = url.searchParams.get('status');

  const pageParam = Number(url.searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const from = (page - 1) * PER_PAGE;

  const statusesResult = await locals.supabase
    .from('article_status')
    .select('id, slug, ordinal')
    .order('ordinal');

  if (statusesResult.error) throw error(500, 'Failed to load statuses.');

  const statuses = (statusesResult.data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    ordinal: row.ordinal,
  }));

  // An unknown status in the query string filters to nothing rather than silently showing
  // everything, which would be the more confusing of the two.
  const status = statusSlug === null ? null : (statuses.find((s) => s.slug === statusSlug) ?? null);

  let query = locals.supabase
    .from('article')
    .select(ARTICLE_COLUMNS, { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, from + PER_PAGE - 1);

  if (status !== null) query = query.eq('article_status_id', status.id);

  const articlesResult = await query;
  if (articlesResult.error) throw error(500, 'Failed to load articles.');

  const articles: ArticleRow[] = [];
  for (const row of articlesResult.data ?? []) {
    const rowStatus = toOne(row.article_status);
    if (rowStatus === null) continue;

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
      status: { id: rowStatus.id, slug: rowStatus.slug, ordinal: rowStatus.ordinal },
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

  const [uiCopy, entityCopy] = await Promise.all([
    loadScopedCopy(locals.supabase, ['content'], locals.locale.code, locals.defaultLocale.code),
    loadEntityCopy(
      locals.supabase,
      [
        { scope: 'article', ids: articles.map((article) => article.id) },
        { scope: 'article_status', ids: statuses.map((s) => s.id) },
        {
          scope: 'author_profile',
          ids: articles.flatMap((article) => article.bylines.map((author) => author.id)),
        },
        {
          scope: 'section',
          ids: articles.flatMap((article) => article.sections.map((entry) => entry.id)),
        },
      ],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ]);

  return {
    articles,
    statuses,
    statusSlug: status?.slug ?? null,
    total: articlesResult.count ?? articles.length,
    page,
    perPage: PER_PAGE,
    localeCode: locals.locale.code,
    copy: [...uiCopy, ...entityCopy],
  };
};

export const actions: Actions = {
  // Two statements — the article and its headline copy — so it goes through the base template's
  // create_local_text_entry for the copy half, after the article insert. A headline is what makes
  // an article findable in the admin list, so creating one without it would produce a row the
  // editor cannot identify among its siblings.
  create: async ({ locals, request }) => {
    const form = await request.formData();
    const canonicalSlug = (form.get('canonical_slug') as string | null)?.trim();
    const headline = (form.get('headline') as string | null)?.trim();

    if (!canonicalSlug) return fail(422, { error: 'A URL slug is required.' });
    if (!headline) return fail(422, { error: 'A headline is required.' });

    // New articles start at the first workflow status by ordinal rather than a hardcoded slug,
    // so renaming or reordering the workflow does not strand this action.
    const statusResult = await locals.supabase
      .from('article_status')
      .select('id')
      .order('ordinal')
      .limit(1)
      .maybeSingle();

    if (statusResult.error || !statusResult.data) {
      return fail(500, { error: 'No article statuses are configured.' });
    }

    const insertResult = await locals.supabase
      .from('article')
      .insert({ article_status_id: statusResult.data.id, canonical_slug: canonicalSlug })
      .select('id')
      .single();

    if (insertResult.error || insertResult.data === null) {
      // 23505 is unique_violation on canonical_slug, which is a user error rather than a fault.
      if (insertResult.error?.code === '23505') {
        return fail(409, { error: 'That URL slug is already in use.' });
      }
      return fail(500, { error: 'Failed to create the article.' });
    }

    const articleId = insertResult.data.id;

    const { error: copyError } = await locals.supabase.rpc('create_local_text_entry', {
      p_slug: 'headline',
      p_scope: 'article',
      p_entity_id: articleId,
      p_locale_ids: [locals.locale.id],
      p_contents: [headline],
    });

    if (copyError) {
      // The article exists but has no headline. Report it rather than pretending: the editor can
      // set one on the detail screen, and silently redirecting would hide a half-finished create.
      return fail(500, {
        error: 'The article was created but its headline could not be saved. Open it and set one.',
      });
    }

    redirect(303, `/admin/content/article/${articleId}`);
  },
};

import { error, fail } from '@sveltejs/kit';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { Actions, PageServerLoad } from './$types';

// POC ADDITION — comment moderation.
//
// Without this screen the public comment form is write-only. `comment.status` defaults
// to 'pending', the module's public read policy admits only 'approved', and nothing in
// the scaffold could move a row between the two — so every reader comment went into a
// hole. One screen and one update statement is the whole fix.
//
// comment.body is the one deliberate exception to the no-copy-columns rule: it is
// runtime reader data, not editorial copy, so it never enters the dictionary and is
// rendered here straight from the column.

const toOne = <T>(embed: T | T[] | null): T | null =>
  embed === null ? null : Array.isArray(embed) ? (embed[0] ?? null) : embed;

const MODERATABLE = ['pending', 'approved', 'rejected', 'flagged'] as const;

export const load: PageServerLoad = async ({ locals }) => {
  // No status filter: a moderator needs to see what they approved as well as what is
  // waiting, and to be able to reverse a call. Pending sorts first in the page.
  const commentResult = await locals.supabase
    .from('comment')
    .select(
      'id, article_id, author_name, author_email, body, status, created_at, article!inner(id, canonical_slug)'
    )
    .order('created_at', { ascending: false });

  if (commentResult.error) throw error(500, 'Failed to load comments.');

  const comments = (commentResult.data ?? []).flatMap((row) => {
    const article = toOne(row.article);
    if (article === null) return [];
    return [
      {
        id: row.id,
        articleId: article.id,
        articleSlug: article.canonical_slug,
        authorName: row.author_name,
        authorEmail: row.author_email,
        body: row.body,
        status: row.status as (typeof MODERATABLE)[number],
        createdAt: row.created_at,
      },
    ];
  });

  const [uiCopy, entityCopy] = await Promise.all([
    loadScopedCopy(locals.supabase, ['content'], locals.locale.code, locals.defaultLocale.code),
    loadEntityCopy(
      locals.supabase,
      [{ scope: 'article', ids: [...new Set(comments.map((comment) => comment.articleId))] }],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ]);

  return {
    comments,
    localeCode: locals.locale.code,
    copy: [...uiCopy, ...entityCopy],
  };
};

export const actions: Actions = {
  /** One column on one row, so a plain update rather than an RPC. */
  moderate: async ({ locals, request }) => {
    const form = await request.formData();
    const commentId = Number(form.get('comment_id'));
    const status = String(form.get('status') ?? '');

    if (!Number.isInteger(commentId)) return fail(422, { error: 'Invalid comment.' });
    if (!(MODERATABLE as readonly string[]).includes(status)) {
      return fail(422, { error: 'Invalid status.' });
    }

    // .select() so a row RLS filtered out is reported rather than reading as success.
    const { data: moderated, error: updateError } = await locals.supabase
      .from('comment')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', commentId)
      .select('id');

    if (updateError) {
      if (updateError.code === '42501') {
        return fail(403, { error: 'Not allowed to moderate comments.' });
      }
      return fail(500, { error: 'Failed to update the comment.' });
    }
    if ((moderated ?? []).length === 0) {
      return fail(403, { error: 'Not allowed to moderate comments.' });
    }

    return { success: true as const };
  },
};

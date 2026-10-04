import { error, fail } from '@sveltejs/kit';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { Actions, PageServerLoad } from './$types';

// POC ADDITION — the newsroom board.
//
// The article list is a table sorted by date, which answers "what exists" but not
// "what is waiting on me". This is the desk view: every story that is not yet out,
// in workflow columns, with who owns it and what is blocking it.
//
// Publishing is deliberately NOT available here. The publish gate lives on the
// article screen and runs the module's validateArticleForPublish over the whole
// story; reimplementing it for a board button would mean two gates that drift apart.
// So the board advances a story as far as `ready` and sends it back, and the last
// step is taken on the story itself.
//
// No auth guard: the (admin) layout already refuses non-admins, and RLS refuses the
// writes regardless.

const toOne = <T>(embed: T | T[] | null): T | null =>
  embed === null ? null : Array.isArray(embed) ? (embed[0] ?? null) : embed;

/** The furthest the board will advance a story. Beyond this, use the article screen. */
const BOARD_CEILING = 'ready';

export const load: PageServerLoad = async ({ locals }) => {
  const [statusesResult, articlesResult, checklistResult] = await Promise.all([
    locals.supabase.from('article_status').select('id, slug, ordinal').order('ordinal'),
    locals.supabase
      .from('article')
      .select(
        'id, article_status_id, canonical_slug, published_at, created_at, embargo_until, article_status!inner(id, slug, ordinal), article_byline(position, author_profile(id, slug)), article_checklist_state(publish_checklist_item_id, satisfied), article_assignment(role, due_at, user_account_id)'
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    locals.supabase.from('publish_checklist_item').select('id, required'),
  ]);

  if (statusesResult.error) throw error(500, 'Failed to load statuses.');
  if (articlesResult.error) throw error(500, 'Failed to load the board.');
  if (checklistResult.error) throw error(500, 'Failed to load the publish checklist.');

  const statuses = (statusesResult.data ?? []).map((status) => ({
    id: status.id,
    slug: status.slug,
    ordinal: status.ordinal,
  }));

  const requiredItemIds = new Set(
    (checklistResult.data ?? []).filter((item) => item.required).map((item) => item.id)
  );

  const cards = (articlesResult.data ?? []).flatMap((row) => {
    const status = toOne(row.article_status);
    if (status === null) return [];

    const states = row.article_checklist_state ?? [];
    // Progress against the required items only: an unticked optional item is a
    // reminder, not a blocker, and showing it as missing would cry wolf.
    const satisfiedRequired = states.filter(
      (state) => requiredItemIds.has(state.publish_checklist_item_id) && state.satisfied
    ).length;

    const assignment = (row.article_assignment ?? [])[0] ?? null;

    return [
      {
        id: row.id,
        canonicalSlug: row.canonical_slug,
        statusId: status.id,
        statusSlug: status.slug,
        statusOrdinal: status.ordinal,
        embargoUntil: row.embargo_until,
        createdAt: row.created_at,
        authorIds: (row.article_byline ?? [])
          .map((byline) => ({ position: byline.position, author: toOne(byline.author_profile) }))
          .filter(
            (byline): byline is { position: number; author: { id: number; slug: string } } =>
              byline.author !== null
          )
          .sort((a, b) => a.position - b.position)
          .map(({ author }) => author.id),
        assignmentRole: assignment?.role ?? null,
        dueAt: assignment?.due_at ?? null,
        requiredTotal: requiredItemIds.size,
        requiredSatisfied: satisfiedRequired,
      },
    ];
  });

  const [uiCopy, entityCopy] = await Promise.all([
    loadScopedCopy(locals.supabase, ['content'], locals.locale.code, locals.defaultLocale.code),
    loadEntityCopy(
      locals.supabase,
      [
        { scope: 'article', ids: cards.map((card) => card.id) },
        { scope: 'article_status', ids: statuses.map((status) => status.id) },
        { scope: 'author_profile', ids: cards.flatMap((card) => card.authorIds) },
      ],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ]);

  return {
    statuses,
    cards,
    boardCeiling: BOARD_CEILING,
    localeCode: locals.locale.code,
    copy: [...uiCopy, ...entityCopy],
  };
};

export const actions: Actions = {
  /**
   * Moves a story one step along the workflow, or one step back.
   *
   * The target is computed from the ordinal rather than submitted, so a crafted form
   * cannot jump a story straight to published past the gate on the article screen.
   */
  move: async ({ locals, request }) => {
    const form = await request.formData();
    const articleId = Number(form.get('article_id'));
    const direction = String(form.get('direction') ?? '');

    if (!Number.isInteger(articleId)) return fail(422, { error: 'Invalid article.' });
    if (direction !== 'forward' && direction !== 'back') {
      return fail(422, { error: 'Invalid direction.' });
    }

    const [articleResult, statusesResult] = await Promise.all([
      locals.supabase
        .from('article')
        .select('id, article_status!inner(id, slug, ordinal)')
        .eq('id', articleId)
        .maybeSingle(),
      locals.supabase.from('article_status').select('id, slug, ordinal').order('ordinal'),
    ]);

    if (articleResult.error) return fail(500, { error: 'Failed to read the article.' });
    if (!articleResult.data) return fail(404, { error: 'Article not found.' });
    if (statusesResult.error) return fail(500, { error: 'Failed to read statuses.' });

    const current = toOne(articleResult.data.article_status);
    if (current === null) return fail(500, { error: 'Article has no status.' });

    const ordered = statusesResult.data ?? [];
    const index = ordered.findIndex((status) => status.id === current.id);
    if (index === -1) return fail(500, { error: 'Unknown status.' });

    const target = ordered[direction === 'forward' ? index + 1 : index - 1];
    if (!target) return fail(422, { error: 'No further step in that direction.' });

    const ceiling = ordered.find((status) => status.slug === BOARD_CEILING);
    if (direction === 'forward' && ceiling && target.ordinal > ceiling.ordinal) {
      return fail(422, {
        error: 'Publishing happens on the article, where the full publish check runs.',
      });
    }

    // .select() so the affected rows come back. Without it an update that RLS
    // filtered to zero rows returns no error, and this action would report success
    // for a move that never happened.
    const { data: moved, error: updateError } = await locals.supabase
      .from('article')
      .update({ article_status_id: target.id })
      .eq('id', articleId)
      .select('id');

    if (updateError) {
      if (updateError.code === '42501') {
        return fail(403, { error: 'Not allowed to move this article.' });
      }
      return fail(500, { error: 'Failed to move the article.' });
    }
    if ((moved ?? []).length === 0) {
      return fail(403, { error: 'Not allowed to move this article.' });
    }

    return { success: true as const };
  },
};

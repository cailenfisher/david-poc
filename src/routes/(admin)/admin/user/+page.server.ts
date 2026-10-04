import { error, fail } from '@sveltejs/kit';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { Actions, PageServerLoad } from './$types';

// POC ADDITION — people.
//
// `user_account.admin` is the source of truth for authorization and there was no UI
// for it: promoting anyone meant a direct SQL update. This screen is that, plus the
// link between a principal and the author profile that carries their byline.
//
// Emails come from admin_list_people() rather than a PostgREST query, because
// auth.users is not in the exposed schemas and this architecture deliberately keeps
// identity columns out of public.user_account. That function is SECURITY DEFINER with
// its own admin check — see supabase/supplemental/05-newsroom-admin-rpc.sql.
//
// There is no invitation flow: Supabase Auth signup is the only way a principal comes
// into existence, and ensure_user_account() provisions it on the first authenticated
// request. So this manages people who have already signed in, and says so.

export const load: PageServerLoad = async ({ locals }) => {
  const [peopleResult, authorResult, adminCountResult] = await Promise.all([
    locals.supabase.rpc('admin_list_people'),
    locals.supabase
      .from('author_profile')
      .select('id, user_account_id, slug, active, created_at')
      .order('slug'),
    locals.supabase.rpc('admin_count'),
  ]);

  if (peopleResult.error) throw error(500, 'Failed to load people.');
  if (authorResult.error) throw error(500, 'Failed to load author profiles.');
  if (adminCountResult.error) throw error(500, 'Failed to count administrators.');

  const authors = (authorResult.data ?? []).map((author) => ({
    id: author.id,
    userAccountId: author.user_account_id,
    slug: author.slug,
    active: author.active,
    createdAt: author.created_at,
  }));

  const people = (
    peopleResult.data as Array<{
      user_account_id: number;
      email: string | null;
      admin: boolean;
      created_at: string;
    }> | null
  ) ?? [];

  const [uiCopy, entityCopy] = await Promise.all([
    loadScopedCopy(locals.supabase, ['content'], locals.locale.code, locals.defaultLocale.code),
    loadEntityCopy(
      locals.supabase,
      [{ scope: 'author_profile', ids: authors.map((author) => author.id) }],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ]);

  return {
    people: people.map((person) => ({
      userAccountId: person.user_account_id,
      email: person.email,
      admin: person.admin,
      createdAt: person.created_at,
      // The author profile currently pointing at this principal, if any.
      authorProfileId: authors.find((author) => author.userAccountId === person.user_account_id)?.id ?? null,
    })),
    authors,
    adminCount: (adminCountResult.data as number | null) ?? 0,
    currentUserAccountId: locals.userAccountId,
    localeCode: locals.locale.code,
    copy: [...uiCopy, ...entityCopy],
  };
};

export const actions: Actions = {
  /** Promotes or demotes a principal. One column, so a plain update. */
  admin: async ({ locals, request }) => {
    const form = await request.formData();
    const userAccountId = Number(form.get('user_account_id'));
    const makeAdmin = form.get('admin') === 'true';

    if (!Number.isInteger(userAccountId)) return fail(422, { error: 'Invalid person.' });

    // Through a definer RPC, not a table update: `authenticated` has no UPDATE
    // privilege on user_account at all now. Before that was revoked, any principal
    // could PATCH its own row and set admin = true — see
    // supabase/supplemental/06-user-account-hardening.sql. The admin check and the
    // last-administrator guard both live in the function, so neither can be skipped
    // by calling the Data API directly.
    const { error: rpcError } = await locals.supabase.rpc('admin_set_user_admin', {
      p_user_account_id: userAccountId,
      p_admin: makeAdmin,
    });

    if (rpcError) {
      if (rpcError.message?.includes('at least one administrator')) {
        return fail(422, { error: 'There has to be at least one administrator.' });
      }
      if (rpcError.message?.includes('admin privileges required')) {
        return fail(403, { error: 'Not allowed to change administrators.' });
      }
      if (rpcError.message?.includes('no such principal')) {
        return fail(404, { error: 'Person not found.' });
      }
      return fail(500, { error: 'Failed to update the person.' });
    }

    return { success: true as const };
  },

  /**
   * Points an author profile at a principal, or clears the link.
   *
   * Two statements — clear whoever held it, then set the new one — because
   * author_profile.user_account_id has a unique index and assigning a principal that
   * already holds another profile would otherwise fail halfway.
   */
  author_profile: async ({ locals, request }) => {
    const form = await request.formData();
    const userAccountId = Number(form.get('user_account_id'));
    const raw = form.get('author_profile_id');
    const authorProfileId = raw ? Number(raw) : null;

    if (!Number.isInteger(userAccountId)) return fail(422, { error: 'Invalid person.' });
    if (authorProfileId !== null && !Number.isInteger(authorProfileId)) {
      return fail(422, { error: 'Invalid author profile.' });
    }

    const { error: clearError } = await locals.supabase
      .from('author_profile')
      .update({ user_account_id: null })
      .eq('user_account_id', userAccountId);

    if (clearError) {
      if (clearError.code === '42501') {
        return fail(403, { error: 'Not allowed to change author profiles.' });
      }
      return fail(500, { error: 'Failed to clear the previous link.' });
    }

    if (authorProfileId !== null) {
      // The clear above legitimately affects zero rows when the principal held no
      // profile, so only this half checks the count.
      const { data: linked, error: setError } = await locals.supabase
        .from('author_profile')
        .update({ user_account_id: userAccountId })
        .eq('id', authorProfileId)
        .select('id');

      if (!setError && (linked ?? []).length === 0) {
        return fail(403, { error: 'Not allowed to change author profiles.' });
      }

      if (setError) {
        if (setError.code === '23505') {
          return fail(422, { error: 'That author profile is already linked to someone else.' });
        }
        if (setError.code === '42501') {
          return fail(403, { error: 'Not allowed to change author profiles.' });
        }
        return fail(500, { error: 'Failed to link the author profile.' });
      }
    }

    return { success: true as const };
  },
};

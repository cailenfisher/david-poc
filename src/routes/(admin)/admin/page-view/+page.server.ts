import { error } from '@sveltejs/kit';
import { loadPageViewReport } from '$lib/server/page-view';
import { loadScopedCopy } from '$lib/server/scoped-copy';
import { PAGE_VIEW_WINDOWS } from '$lib/types/page-view';
import type { PageServerLoad } from './$types';

// Visitor analytics report. The window is a query parameter rather than form state
// so a report is linkable and the back button works.

export const load: PageServerLoad = async ({ locals, url }) => {
  const requested = Number(url.searchParams.get('days'));
  const days = PAGE_VIEW_WINDOWS.find((window) => window === requested) ?? PAGE_VIEW_WINDOWS[0];

  const [report, copy] = await Promise.all([
    loadPageViewReport(locals.supabase, days).catch((failure) => {
      console.error('[page-view] report failed:', failure);
      throw error(500, 'Failed to load visitor analytics.');
    }),
    loadScopedCopy(locals.supabase, 'page_view', locals.locale.code, locals.defaultLocale.code),
  ]);

  return {
    report,
    windows: [...PAGE_VIEW_WINDOWS],
    localeCode: locals.locale.code,
    copy,
  };
};

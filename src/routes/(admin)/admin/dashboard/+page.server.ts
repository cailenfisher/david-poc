import type { PageServerLoad } from './$types'
import { loadPageViewReport } from '$lib/server/page-view'
import { loadScopedCopy } from '$lib/server/scoped-copy'

export const load: PageServerLoad = async ({ locals }) => {
  // The visitor widget is an extra, not the dashboard's reason to exist: if its
  // queries fail, the dashboard still renders, just without it.
  const [pageView, pageViewCopy] = await Promise.all([
    loadPageViewReport(locals.supabase, 7, 5).catch((failure) => {
      console.error('[dashboard] page view report failed:', failure)
      return null
    }),
    loadScopedCopy(locals.supabase, 'page_view', locals.locale.code, locals.defaultLocale.code),
  ])

  // Replace these stubs with real queries using locals.supabase
  // e.g. const { count } = await locals.supabase.from('user_account').select('id', { count: 'exact', head: true })
  return {
    stats: {
      totalUsers: null as number | null,
      activeSessions: null as number | null,
      published: null as number | null,
      pendingReview: null as number | null,
    },
    pageView,
    pageViewCopy,
    localeCode: locals.locale.code,
  }
}

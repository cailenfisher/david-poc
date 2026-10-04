import type { PageServerLoad } from './$types'
import {
  loadActiveArticle,
  loadArticleStatusCount,
  loadCommentQueue,
  loadTrendingArticle,
} from '$lib/server/dashboard'
import { loadPageViewReport } from '$lib/server/page-view'
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy'

const REPORT_DAYS = 7
const LIST_LIMIT = 5

/**
 * Each widget is an overview of a screen that exists in its own right, so none is
 * the dashboard's reason to exist: a widget whose query fails is left out and the
 * rest still render.
 */
function optional<T>(name: string, load: Promise<T>): Promise<T | null> {
  return load.catch((failure) => {
    console.error(`[dashboard] ${name} failed:`, failure)
    return null
  })
}

export const load: PageServerLoad = async ({ locals }) => {
  const { supabase } = locals

  const [pageView, articleStatusCount, activeArticle, trendingArticle, commentQueue] =
    await Promise.all([
      optional('page view report', loadPageViewReport(supabase, REPORT_DAYS, LIST_LIMIT)),
      optional('article status count', loadArticleStatusCount(supabase)),
      optional('active articles', loadActiveArticle(supabase, LIST_LIMIT)),
      optional('trending articles', loadTrendingArticle(supabase, REPORT_DAYS, LIST_LIMIT)),
      optional('comment queue', loadCommentQueue(supabase)),
    ])

  // Copy for exactly the entities on screen: every status, plus the headlines of the
  // stories the two lists show.
  const articleIds = [...(activeArticle ?? []), ...(trendingArticle ?? [])].map(
    (article) => article.id
  )
  const statusIds = (articleStatusCount ?? []).map((entry) => entry.status.id)

  const [uiCopy, entityCopy] = await Promise.all([
    loadScopedCopy(
      supabase,
      ['dashboard', 'page_view'],
      locals.locale.code,
      locals.defaultLocale.code
    ),
    loadEntityCopy(
      supabase,
      [
        { scope: 'article', ids: articleIds },
        { scope: 'article_status', ids: statusIds },
      ],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ])

  return {
    pageView,
    articleStatusCount,
    activeArticle,
    trendingArticle,
    commentQueue,
    copy: [...uiCopy, ...entityCopy],
    localeCode: locals.locale.code,
  }
}

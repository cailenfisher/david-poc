import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ActiveArticle,
  ArticleStatusCount,
  CommentQueue,
  TrendingArticle,
} from '$lib/types/dashboard';

// Loaders for the admin dashboard's newsroom widgets. Grouping happens in SQL
// (supabase/supplemental/08-dashboard.sql); these only cross the snake_case and
// bigint-as-string boundary.

/** RPCs return bigint columns, which PostgREST may send as strings. */
const count = (value: number | string | null | undefined) => Number(value ?? 0);

/** Every workflow status in order, with how many live stories sit at it. */
export async function loadArticleStatusCount(
  supabase: SupabaseClient
): Promise<ArticleStatusCount[]> {
  const [statusResult, countResult] = await Promise.all([
    supabase.from('article_status').select('id, slug, ordinal').order('ordinal'),
    supabase.rpc('article_status_count'),
  ]);

  const failure = statusResult.error ?? countResult.error;
  if (failure) throw failure;

  type CountRow = { article_status_id: number | string; article_count: number | string };
  const countByStatus = new Map(
    ((countResult.data ?? []) as CountRow[]).map((row) => [
      Number(row.article_status_id),
      count(row.article_count),
    ])
  );

  return (statusResult.data ?? []).map((row) => ({
    status: { id: Number(row.id), slug: row.slug, ordinal: row.ordinal },
    articleCount: countByStatus.get(Number(row.id)) ?? 0,
  }));
}

/** Stories still being worked on, the most pressing first. */
export async function loadActiveArticle(
  supabase: SupabaseClient,
  limit: number
): Promise<ActiveArticle[]> {
  const { data, error } = await supabase.rpc('article_active', { p_limit: limit });
  if (error) throw error;

  type ActiveRow = {
    article_id: number | string;
    article_status_id: number | string;
    canonical_slug: string;
    embargo_until: string | null;
    updated_at: string;
    due_at: string | null;
  };

  return ((data ?? []) as ActiveRow[]).map((row) => ({
    id: Number(row.article_id),
    articleStatusId: Number(row.article_status_id),
    canonicalSlug: row.canonical_slug,
    embargoUntil: row.embargo_until,
    updatedAt: row.updated_at,
    dueAt: row.due_at,
  }));
}

/** The most-read stories over the last `days` days. */
export async function loadTrendingArticle(
  supabase: SupabaseClient,
  days: number,
  limit: number
): Promise<TrendingArticle[]> {
  const { data, error } = await supabase.rpc('page_view_top_article', {
    p_days: days,
    p_limit: limit,
  });
  if (error) throw error;

  type TrendingRow = {
    article_id: number | string;
    canonical_slug: string;
    view_count: number | string;
    visitor_count: number | string;
  };

  return ((data ?? []) as TrendingRow[]).map((row) => ({
    id: Number(row.article_id),
    canonicalSlug: row.canonical_slug,
    viewCount: count(row.view_count),
    visitorCount: count(row.visitor_count),
  }));
}

/** Head-only counts: the dashboard needs how many, never the comments themselves. */
export async function loadCommentQueue(supabase: SupabaseClient): Promise<CommentQueue> {
  const countAt = (status: string) =>
    supabase.from('comment').select('id', { count: 'exact', head: true }).eq('status', status);

  const [pendingResult, flaggedResult] = await Promise.all([
    countAt('pending'),
    countAt('flagged'),
  ]);

  const failure = pendingResult.error ?? flaggedResult.error;
  if (failure) throw failure;

  return {
    pendingCount: pendingResult.count ?? 0,
    flaggedCount: flaggedResult.count ?? 0,
  };
}

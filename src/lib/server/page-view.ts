import type { SupabaseClient } from '@supabase/supabase-js';
import type { PageViewReport } from '$lib/types/page-view';

/**
 * Paths that are never recorded, whatever the beacon sends. Admin and auth screens
 * would otherwise drown out real traffic with the operators' own clicks.
 */
const EXCLUDED_PREFIXES = ['/admin', '/sign-in', '/sign-out', '/auth', '/api', '/preview'];

const MAX_PATH_LENGTH = 2048;

export function recordablePath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;
  if (path.length > MAX_PATH_LENGTH) return null;
  const excluded = EXCLUDED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
  return excluded ? null : path;
}

/**
 * Reduces a referrer URL to its host, or null for direct, same-site, or unparseable
 * referrers. Same-site is null because in-app navigation is not acquisition.
 */
export function referrerHostOf(referrer: unknown, siteHost: string): string | null {
  if (typeof referrer !== 'string' || referrer === '') return null;
  try {
    const host = new URL(referrer).host.toLowerCase();
    return host && host !== siteHost.toLowerCase() ? host.slice(0, 255) : null;
  } catch {
    return null;
  }
}

/** Every report RPC returns bigint counts, which PostgREST may send as strings. */
const count = (value: number | string | null | undefined) => Number(value ?? 0);

/**
 * Loads one report window. Runs as the caller, so a non-admin gets zeros rather
 * than an error — page_view_admin_read is what scopes it.
 */
export async function loadPageViewReport(
  supabase: SupabaseClient,
  days: number,
  limit = 10
): Promise<PageViewReport> {
  const [totalResult, dailyResult, pathResult, referrerResult] = await Promise.all([
    supabase.rpc('page_view_total', { p_days: days }).single(),
    supabase.rpc('page_view_daily', { p_days: days }),
    supabase.rpc('page_view_top_path', { p_days: days, p_limit: limit }),
    supabase.rpc('page_view_top_referrer', { p_days: days, p_limit: limit }),
  ]);

  const failure = totalResult.error ?? dailyResult.error ?? pathResult.error ?? referrerResult.error;
  if (failure) throw failure;

  const total = totalResult.data as { view_count: number; visitor_count: number } | null;

  type DailyRow = { day: string; view_count: number; visitor_count: number };
  type PathRow = { path: string; view_count: number; visitor_count: number };
  type ReferrerRow = { referrer_host: string | null; view_count: number };

  return {
    days,
    viewCount: count(total?.view_count),
    visitorCount: count(total?.visitor_count),
    daily: ((dailyResult.data ?? []) as DailyRow[]).map((row) => ({
      day: row.day,
      viewCount: count(row.view_count),
      visitorCount: count(row.visitor_count),
    })),
    topPath: ((pathResult.data ?? []) as PathRow[]).map((row) => ({
      path: row.path,
      viewCount: count(row.view_count),
      visitorCount: count(row.visitor_count),
    })),
    topReferrer: ((referrerResult.data ?? []) as ReferrerRow[]).map((row) => ({
      referrerHost: row.referrer_host,
      viewCount: count(row.view_count),
    })),
  };
}

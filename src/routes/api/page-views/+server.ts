import type { RequestHandler } from './$types';
import { recordablePath, referrerHostOf } from '$lib/server/page-view';

// Receives the beacon sent after each client navigation (page-view-beacon.ts).
//
// Always answers 204, recorded or not: the browser ignores a beacon's response, and
// a visitor's page must never surface an analytics failure. Failures are logged.
//
// Runs on the request's own client — anon for visitors — and page_view_public_insert
// is the only policy that lets it write. No .select() after the insert, so the
// visitor never needs (and never has) read access to the table.

const VISITOR_COOKIE = 'visitor_id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: RequestHandler = async ({ request, cookies, locals, url }) => {
  // sendBeacon posts a text/plain blob, so parse the text rather than request.json().
  let body: { path?: unknown; referrer?: unknown };
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 204 });
  }

  const path = recordablePath(body.path);
  if (!path) return new Response(null, { status: 204 });

  let visitorId = cookies.get(VISITOR_COOKIE);
  if (!visitorId || !UUID_PATTERN.test(visitorId)) {
    visitorId = crypto.randomUUID();
  }
  // Refreshed on every view so an active visitor keeps one id.
  cookies.set(VISITOR_COOKIE, visitorId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: true,
  });

  const { error } = await locals.supabase.from('page_view').insert({
    visitor_id: visitorId,
    path,
    referrer_host: referrerHostOf(body.referrer, url.host),
    locale_id: locals.locale.id || null,
  });

  if (error) console.error('[page-view] insert error:', error);

  return new Response(null, { status: 204 });
};

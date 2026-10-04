import type { AfterNavigate } from '@sveltejs/kit';

/**
 * Reports one page view to /api/page-views. Call from afterNavigate in the root
 * layout: it fires once on the initial load and once per client-side navigation,
 * and never for hover-preloads or invalidations — which is why recording lives
 * here rather than in a server hook.
 *
 * The server decides what is recordable (admin paths are dropped there); this only
 * reports what the visitor saw.
 */
export function sendPageView(navigation: AfterNavigate): void {
  if (!navigation.to) return;

  // On the first load the referrer is whoever sent the visitor here. After that,
  // navigation is in-app, and the previous page is the referrer.
  const referrer = navigation.from ? navigation.from.url.href : document.referrer;

  const body = JSON.stringify({ path: navigation.to.url.pathname, referrer });

  // sendBeacon survives the page unloading and never blocks navigation. The fetch
  // fallback covers browsers or privacy settings that disable it.
  if (!navigator.sendBeacon?.('/api/page-views', body)) {
    fetch('/api/page-views', { method: 'POST', body, keepalive: true }).catch(() => {});
  }
}

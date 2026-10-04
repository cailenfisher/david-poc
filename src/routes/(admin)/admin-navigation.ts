// Presentation for the admin sidebar: which Font Awesome icon each item shows and
// whether it sits under the collapsible "Application settings" group. Keyed by
// href because that is what navigation_item rows are unique on (per scope), and
// the table has no icon or group column — if admins need to change these without
// a deploy, they belong in the schema instead.

export const FALLBACK_ICON = 'fa-solid fa-link';

export const APPLICATION_SETTINGS_ICON = 'fa-solid fa-gear';

const ICON_BY_HREF: Record<string, string> = {
  '/admin/dashboard': 'fa-solid fa-gauge-high',
  '/admin/content/board': 'fa-solid fa-table-columns',
  '/admin/content/article': 'fa-solid fa-newspaper',
  '/admin/content/comment': 'fa-solid fa-comments',
  '/admin/page-view': 'fa-solid fa-chart-line',
  '/admin/user': 'fa-solid fa-users',
  '/admin/local-text': 'fa-solid fa-language',
  '/admin/locale': 'fa-solid fa-globe',
  '/admin/navigation-item': 'fa-solid fa-sitemap',
};

const APPLICATION_SETTINGS_HREFS = new Set([
  '/admin/user',
  '/admin/local-text',
  '/admin/locale',
  '/admin/navigation-item',
]);

export function iconFor(href: string): string {
  return ICON_BY_HREF[href] ?? FALLBACK_ICON;
}

export function applicationSetting(href: string): boolean {
  return APPLICATION_SETTINGS_HREFS.has(href);
}

// A link is current for its own page and anything beneath it, so the article
// editor at /admin/content/article/42 still highlights "Stories".
export function currentFor(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

import type { PageViewDay } from '$lib/types/page-view';

/**
 * Turns a report's daily rows into PageViewChart points, formatted for one locale.
 * Days are UTC calendar dates, so they are formatted in UTC too — formatting them
 * in the viewer's zone would shift every label a day west of Greenwich.
 */
export function toPageViewChartPoints(daily: PageViewDay[], localeCode: string) {
  const dateFormat = new Intl.DateTimeFormat(localeCode, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const numberFormat = new Intl.NumberFormat(localeCode);

  return daily.map((row) => ({
    label: dateFormat.format(new Date(`${row.day}T00:00:00Z`)),
    value: row.viewCount,
    valueText: numberFormat.format(row.viewCount),
  }));
}

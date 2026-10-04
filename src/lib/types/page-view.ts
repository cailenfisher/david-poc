/** One day of a page-view report. `day` is an ISO date (YYYY-MM-DD, UTC). */
export interface PageViewDay {
  day: string;
  viewCount: number;
  visitorCount: number;
}

export interface PageViewPath {
  path: string;
  viewCount: number;
  visitorCount: number;
}

/** `referrerHost` null is direct traffic. */
export interface PageViewReferrer {
  referrerHost: string | null;
  viewCount: number;
}

export interface PageViewReport {
  days: number;
  viewCount: number;
  visitorCount: number;
  daily: PageViewDay[];
  topPath: PageViewPath[];
  topReferrer: PageViewReferrer[];
}

/** Report windows an admin can pick. The first is the default. */
export const PAGE_VIEW_WINDOWS = [7, 30, 90] as const;

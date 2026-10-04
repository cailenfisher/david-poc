import type { ArticleStatus } from '@sveltebuilder/content';

/** How many live stories sit at one workflow status. */
export interface ArticleStatusCount {
  status: ArticleStatus;
  articleCount: number;
}

/** A story still being worked on. `dueAt` is its earliest assignment due date. */
export interface ActiveArticle {
  id: number;
  articleStatusId: number;
  canonicalSlug: string;
  embargoUntil: string | null;
  updatedAt: string;
  dueAt: string | null;
}

export interface TrendingArticle {
  id: number;
  canonicalSlug: string;
  viewCount: number;
  visitorCount: number;
}

/** Reader comments waiting on a moderator. */
export interface CommentQueue {
  pendingCount: number;
  flaggedCount: number;
}

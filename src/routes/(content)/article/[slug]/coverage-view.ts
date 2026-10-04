import type { ArticlePageView } from '@sveltebuilder/content/views';
import type { LiveCoverageWithUpdates } from '@sveltebuilder/content';

// POC ADDITION. The article screen's view, widened with this article's live coverage
// thread. `ArticlePageView` is the module's type and describes the bundle as shipped;
// the coverage surface is local to this project, so the widening lives here rather
// than in @sveltebuilder/content/views. An ordinary module beside the route — SvelteKit
// treats only +page, +layout, +server and +error as special.
export type ArticlePageWithCoverage = ArticlePageView & {
  liveCoverage: LiveCoverageWithUpdates | null;
};

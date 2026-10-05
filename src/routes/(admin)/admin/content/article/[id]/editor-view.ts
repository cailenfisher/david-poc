import type { AdminArticleDetailView } from '@sveltebuilder/content/views';
import type { AuthorProfile } from '@sveltebuilder/content';
import type { MediaAssetWithRights } from '$lib/types/media-asset';

// POC ADDITION. The admin detail screen as shipped is a reader: it displays the body
// and the filing and lets you move the article through workflow, but nothing on it
// writes copy. This project turns it into the editor, which needs one thing the
// module's view does not carry — the authors a byline can name.
//
// Widened here rather than in @sveltebuilder/content/views because the editor is
// local to David. Same reasoning as the article screen's coverage-view.ts.
export type ArticleEditorView = AdminArticleDetailView & {
  availableAuthors: AuthorProfile[];
  // The images the editor can place: the article's own plus the most recent uploads, each
  // with the rights and source that only an admin can read. storageBaseUrl is what turns a
  // storageKey into a URL, as on the public article page.
  mediaAssets: MediaAssetWithRights[];
  storageBaseUrl: string;
};

<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { ArticleView } from '@sveltebuilder/content'

  // ArticleView lifts the article's first image block into a hero above the body and then
  // renders that same block again in the body, so the lead image appears twice. The component
  // lives in node_modules and takes no prop to prevent it, so this wrapper hides the body's
  // copy. The first image block in the body is by construction the hero's twin: ArticleView
  // picks the hero as the first block of type image. It also lets a long credit wrap, which
  // the module's own CSS forbids. Remove this wrapper once both are fixed in the module
  // (see beta-deferred.md).
  let props: ComponentProps<typeof ArticleView> = $props()
</script>

<div class="article-view-unique-hero">
  <ArticleView {...props} />
</div>

<style>
  /* Transparent to layout: ArticleView keeps sizing itself against the page. */
  .article-view-unique-hero {
    display: contents;
  }

  /* MediaFigure sets the credit to white-space: nowrap with flex-shrink: 0, so a credit like
     "Photo: Name / Wikimedia Commons, CC BY-SA 4.0, resized" cannot wrap and forces the page
     wider than a phone. Let the credit wrap under the caption instead. */
  .article-view-unique-hero :global(.media-figure__caption) {
    flex-wrap: wrap;
  }

  .article-view-unique-hero :global(.media-figure__credit) {
    white-space: normal;
    flex-shrink: 1;
  }

  /* display: none, not visibility, so the copy leaves the accessibility tree too and the
     lazy-loaded image is never fetched. */
  .article-view-unique-hero :global(.article-view__body > .article-block--image:not(.article-block--image ~ .article-block--image)) {
    display: none;
  }
</style>

<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { ArticleView } from '@sveltebuilder/content'

  // ArticleView lifts the article's first image block into a hero above the body and then
  // renders that same block again in the body, so the lead image appears twice. The component
  // lives in node_modules and takes no prop to prevent it, so this wrapper hides the body's
  // copy. The first image block in the body is by construction the hero's twin: ArticleView
  // picks the hero as the first block of type image. Remove this wrapper once the module
  // stops rendering the hero block in the body (see beta-deferred.md).
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

  /* display: none, not visibility, so the copy leaves the accessibility tree too and the
     lazy-loaded image is never fetched. */
  .article-view-unique-hero :global(.article-view__body > .article-block--image:not(.article-block--image ~ .article-block--image)) {
    display: none;
  }
</style>

<!--
  One entry in a most-read ranking: the story's headline and how often it was read.
  Resolves the headline through diglossia, so it is an entity component. Renders its
  own `<li>`; put it in an `<ol>` so the rank is announced.
-->
<script lang="ts">
  import { getDictionary } from 'diglossia/svelte'
  import type { DictionaryInstance } from 'diglossia'
  import type { TrendingArticle } from '$lib/types/dashboard'

  type Props = {
    article: TrendingArticle
    rank: number
    localeCode: string
    /** Names the count for assistive technology, e.g. "Page views". */
    viewCountLabel: string
    dictionary?: DictionaryInstance
  }

  let { article, rank, localeCode, viewCountLabel, dictionary: dictionaryProp }: Props = $props()

  // svelte-ignore state_referenced_locally
  const dictionary = dictionaryProp ?? getDictionary()

  const headline = $derived(dictionary.localText('headline', 'article', article.id))
  const headlineLocale = $derived(dictionary.localeOf('headline', 'article', article.id))

  const numberFormat = $derived(new Intl.NumberFormat(localeCode))
</script>

<li class="trending-article">
  <span class="trending-article__rank" aria-hidden="true">{numberFormat.format(rank)}</span>
  <a
    class="trending-article__headline"
    href="/admin/content/article/{article.id}"
    lang={headlineLocale !== localeCode ? headlineLocale : undefined}
  >
    {headline}
  </a>
  <span class="trending-article__count">
    <span class="trending-article__hidden">{viewCountLabel}:</span>
    {numberFormat.format(article.viewCount)}
  </span>
</li>

<style>
  .trending-article {
    display: grid;
    grid-template-columns: 1.5rem minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.75rem;
    padding: 0.625rem 0;
  }

  .trending-article__rank {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-soft, inherit);
    font-variant-numeric: tabular-nums;
  }

  .trending-article__headline {
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
    text-decoration: none;
  }

  .trending-article__headline:hover {
    text-decoration: underline;
  }

  .trending-article__count {
    font-size: 0.875rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .trending-article__hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>

<!--
  One story still being worked on: its headline, where it sits in the workflow, and
  when it is due. Resolves the headline and status name through diglossia, so it is
  an entity component. Renders its own `<li>`.
-->
<script lang="ts">
  import { getDictionary } from 'diglossia/svelte'
  import type { DictionaryInstance } from 'diglossia'
  import { Badge } from '@sveltebuilder/coreui'
  import type { ActiveArticle } from '$lib/types/dashboard'

  type Props = {
    article: ActiveArticle
    localeCode: string
    dueLabel: string
    overdueLabel: string
    embargoedLabel: string
    dictionary?: DictionaryInstance
  }

  let {
    article,
    localeCode,
    dueLabel,
    overdueLabel,
    embargoedLabel,
    dictionary: dictionaryProp,
  }: Props = $props()

  // svelte-ignore state_referenced_locally
  const dictionary = dictionaryProp ?? getDictionary()

  const headline = $derived(dictionary.localText('headline', 'article', article.id))
  const headlineLocale = $derived(dictionary.localeOf('headline', 'article', article.id))
  const statusName = $derived(
    dictionary.localText('name', 'article_status', article.articleStatusId)
  )

  const dateFormat = $derived(
    new Intl.DateTimeFormat(localeCode, { month: 'short', day: 'numeric' })
  )

  const overdue = $derived(article.dueAt !== null && new Date(article.dueAt) < new Date())
</script>

<li class="active-article">
  <a
    class="active-article__headline"
    href="/admin/content/article/{article.id}"
    lang={headlineLocale !== localeCode ? headlineLocale : undefined}
  >
    {headline}
  </a>

  <p class="active-article__meta">
    <Badge size="sm">{statusName}</Badge>
    {#if article.dueAt}
      <span class:active-article__overdue={overdue}>
        {dueLabel}
        <time datetime={article.dueAt}>{dateFormat.format(new Date(article.dueAt))}</time>
        {#if overdue}· {overdueLabel}{/if}
      </span>
    {/if}
    {#if article.embargoUntil}
      <span>
        {embargoedLabel}
        <time datetime={article.embargoUntil}>
          {dateFormat.format(new Date(article.embargoUntil))}
        </time>
      </span>
    {/if}
  </p>
</li>

<style>
  .active-article {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.625rem 0;
  }

  .active-article__headline {
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
    text-decoration: none;
  }

  .active-article__headline:hover {
    text-decoration: underline;
  }

  .active-article__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-soft, inherit);
  }

  .active-article__overdue {
    color: var(--danger-text);
    font-weight: 600;
  }
</style>

<script lang="ts">
  import { createDictionary } from 'diglossia'
  import { ArticleCard, TopicTag } from '@sveltebuilder/content'
  import { Pagination } from '@sveltebuilder/coreui'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const scoped = $derived(createDictionary(data.copy))
  const t = (slug: string) => scoped.localText(slug, 'content')

  const mediaAssets = $derived(new Map(data.mediaAssets.map((asset) => [asset.id, asset])))

  const topicName = $derived(scoped.localText('name', 'topic', data.topic.id))
  const nameLocale = $derived(scoped.localeOf('name', 'topic', data.topic.id))

  const href = (page: number) =>
    page > 1 ? `/topic/${data.topic.slug}?page=${page}` : `/topic/${data.topic.slug}`

  // Sibling topics, minus the one being viewed — a reader on a topic page is browsing
  // by subject, so the other subjects are the useful next click.
  const siblings = $derived(data.allTopics.filter((topic) => topic.id !== data.topic.id))
</script>

<svelte:head>
  <title>{topicName}</title>
  <meta name="description" content="{t('content.topic.heading')}: {topicName}" />
</svelte:head>

<main class="topic-page">
  <header class="topic-page__header">
    <p class="topic-page__kicker">{t('content.topic.heading')}</p>
    <h1 class="topic-page__title" lang={nameLocale !== data.localeCode ? nameLocale : undefined}>
      {topicName}
    </h1>
  </header>

  {#if data.articles.length > 0}
    <div class="topic-page__river">
      {#each data.articles as article, index (article.id)}
        <ArticleCard
          {article}
          {mediaAssets}
          blocks={article.blocks}
          storageBaseUrl={data.storageBaseUrl}
          status={article.status}
          bylines={article.bylines}
          sections={article.sections}
          locale={data.localeCode}
          href="/article/{article.canonicalSlug}"
          variant={index === 0 && data.page === 1 ? 'lead' : 'river'}
          dictionary={scoped}
        />
      {/each}
    </div>

    {#if data.total > data.perPage}
      <Pagination
        page={data.page}
        perPage={data.perPage}
        count={data.total}
        onPageChange={(page) => goto(href(page))}
      />
    {/if}
  {:else}
    <p class="topic-page__empty">{t('content.topic.empty')}</p>
  {/if}

  {#if siblings.length > 0}
    <nav class="topic-page__siblings" aria-label={t('content.topic.all_topics')}>
      <h2 class="topic-page__heading">{t('content.topic.all_topics')}</h2>
      <ul class="topic-page__sibling-list">
        {#each siblings as topic (topic.id)}
          <li>
            <TopicTag
              {topic}
              locale={data.localeCode}
              href="/topic/{topic.slug}"
              dictionary={scoped}
            />
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
</main>

<style>
  .topic-page {
    max-width: 56rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }

  .topic-page__header {
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 2rem;
  }

  .topic-page__kicker {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-soft);
  }

  .topic-page__title {
    margin: 0.25rem 0 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: clamp(1.75rem, 5vw, 2.75rem);
    line-height: 1.1;
  }

  .topic-page__river {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .topic-page__empty {
    margin: 0;
    color: var(--text-soft);
  }

  .topic-page__siblings {
    margin-top: 3rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border-color);
  }

  .topic-page__heading {
    margin: 0 0 0.75rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .topic-page__sibling-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>

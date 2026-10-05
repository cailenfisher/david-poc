<script lang="ts">
  import { createDictionary } from 'diglossia'
  import { ArticleCard } from '@sveltebuilder/content'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  // Request-scoped, not merged into the context instance — same reason as every
  // other screen here: a shared dictionary leaks one visitor's locale into another's.
  const scoped = $derived(createDictionary(data.copy))
  const t = (slug: string) => scoped.localText(slug, 'content')

  const mediaAssets = $derived(new Map(data.mediaAssets.map((asset) => [asset.id, asset])))

  const name = $derived(scoped.localText('name', 'author_profile', data.author.id))
  const nameLocale = $derived(scoped.localeOf('name', 'author_profile', data.author.id))
  const bio = $derived(scoped.localText('bio', 'author_profile', data.author.id))
  const bioLocale = $derived(scoped.localeOf('bio', 'author_profile', data.author.id))
  const expertise = $derived(scoped.localText('expertise', 'author_profile', data.author.id))
</script>

<svelte:head>
  <title>{name}</title>
  <meta name="description" content={bio} />
  <!-- A reporter's page is a Person, and it is what the article JSON-LD's
       author[].url points at. Emitting the same identity here closes that loop. -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    description: bio,
    knowsAbout: expertise,
  })}<\/script>`}
</svelte:head>

<main class="author-page">
  <header class="author-page__header">
    <h1 class="author-page__name" lang={nameLocale !== data.localeCode ? nameLocale : undefined}>
      {name}
    </h1>

    {#if expertise}
      <p class="author-page__expertise">
        <span class="author-page__expertise-label">{t('content.author.expertise')}</span>
        {expertise}
      </p>
    {/if}

    {#if bio}
      <p class="author-page__bio" lang={bioLocale !== data.localeCode ? bioLocale : undefined}>
        {bio}
      </p>
    {/if}
  </header>

  <section class="author-page__articles" aria-labelledby="author-articles">
    <h2 class="author-page__heading" id="author-articles">{t('content.author.articles_by')}</h2>

    {#if data.articles.length > 0}
      <div class="author-page__river">
        {#each data.articles as article (article.id)}
          <ArticleCard
            {article}
            {mediaAssets}
            blocks={article.blocks}
            storageBaseUrl={data.storageBaseUrl}
            status={article.status}
            sections={article.sections}
            topics={article.topics}
            locale={data.localeCode}
            href="/article/{article.canonicalSlug}"
            variant="river"
            dictionary={scoped}
          />
        {/each}
      </div>
    {:else}
      <p class="author-page__empty">{t('content.author.empty')}</p>
    {/if}
  </section>
</main>

<style>
  /* Developer CSS: unlayered, so it wins over coreui's @layer blocks without
     specificity fights. Structure and rhythm only — the cards style themselves. */
  .author-page {
    max-width: 48rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }

  .author-page__header {
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border-color);
  }

  .author-page__name {
    margin: 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    line-height: 1.15;
  }

  .author-page__expertise {
    margin: 0.5rem 0 0;
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-soft);
  }

  .author-page__expertise-label {
    font-weight: 700;
  }

  .author-page__bio {
    margin: 1rem 0 0;
    font-size: 1.0625rem;
    line-height: 1.6;
  }

  .author-page__heading {
    margin: 0 0 1rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid currentColor;
  }

  .author-page__articles {
    padding-top: 2rem;
  }

  .author-page__river {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .author-page__empty {
    margin: 0;
    color: var(--text-soft);
  }
</style>

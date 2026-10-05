<script lang="ts">
  import { createDictionary } from 'diglossia'
  import { ArticleCard, SectionLabel } from '@sveltebuilder/content'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  // Request-scoped, not a merge into the context instance — same reason as the
  // section and article screens: a dictionary shared across concurrent requests
  // leaks one visitor's locale into another's response.
  const scoped = $derived(createDictionary(data.copy))
  const t = (slug: string) => scoped.localText(slug, 'content')

  const mediaAssets = $derived(new Map(data.mediaAssets.map((asset) => [asset.id, asset])))

  const mastheadName = $derived(scoped.localText('name', 'publisher_profile', 1))

  const today = $derived(
    new Intl.DateTimeFormat(data.localeCode, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date())
  )

  // The front is one ordered list in the database; the page groups it by how each
  // slot was placed, because that is what decides where a story physically sits.
  const lead = $derived(data.slots.find((slot) => slot.layoutVariant === 'lead') ?? null)
  const secondaries = $derived(data.slots.filter((slot) => slot.layoutVariant === 'secondary'))
  const river = $derived(data.slots.filter((slot) => slot.layoutVariant === 'river'))
  const briefs = $derived(data.slots.filter((slot) => slot.layoutVariant === 'brief'))
</script>

<svelte:head>
  <title>{mastheadName}</title>
  <meta name="description" content={t('content.front.latest')} />
</svelte:head>

<main class="front">
  <header class="front__masthead">
    <h1 class="front__nameplate">{mastheadName}</h1>
    <p class="front__date">{today}</p>
  </header>

  <nav class="front__sections" aria-label={t('content.front.sections')}>
    {#each data.sections as section (section.id)}
      <SectionLabel {section} locale={data.localeCode} dictionary={scoped} />
    {/each}
  </nav>

  {#if lead || secondaries.length > 0}
    <div class="front__top">
      {#if lead}
        <div class="front__lead">
          <ArticleCard
            article={lead.article}
            {mediaAssets}
            blocks={lead.article.blocks}
            storageBaseUrl={data.storageBaseUrl}
            status={lead.article.status}
            bylines={lead.article.bylines}
            sections={lead.article.sections}
            topics={lead.article.topics}
            locale={data.localeCode}
            href="/article/{lead.article.canonicalSlug}"
            variant="lead"
            dictionary={scoped}
          />
        </div>
      {/if}

      {#if secondaries.length > 0}
        <div class="front__secondaries">
          {#each secondaries as slot (slot.article.id)}
            <ArticleCard
              article={slot.article}
              {mediaAssets}
              blocks={slot.article.blocks}
              storageBaseUrl={data.storageBaseUrl}
              status={slot.article.status}
              bylines={slot.article.bylines}
              sections={slot.article.sections}
              topics={slot.article.topics}
              locale={data.localeCode}
              href="/article/{slot.article.canonicalSlug}"
              variant="secondary"
              dictionary={scoped}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="front__body">
    <section class="front__river" aria-labelledby="front-more">
      <h2 class="front__heading" id="front-more">{t('content.front.more_news')}</h2>
      {#each river as slot (slot.article.id)}
        <ArticleCard
          article={slot.article}
          {mediaAssets}
          blocks={slot.article.blocks}
          storageBaseUrl={data.storageBaseUrl}
          status={slot.article.status}
          bylines={slot.article.bylines}
          sections={slot.article.sections}
          topics={slot.article.topics}
          locale={data.localeCode}
          href="/article/{slot.article.canonicalSlug}"
          variant="river"
          dictionary={scoped}
        />
      {/each}
    </section>

    {#if briefs.length > 0}
      <aside class="front__briefs" aria-labelledby="front-briefs">
        <h2 class="front__heading" id="front-briefs">{t('content.front.briefs')}</h2>
        {#each briefs as slot (slot.article.id)}
          <ArticleCard
            article={slot.article}
            {mediaAssets}
            blocks={slot.article.blocks}
            storageBaseUrl={data.storageBaseUrl}
            status={slot.article.status}
            bylines={slot.article.bylines}
            sections={slot.article.sections}
            topics={slot.article.topics}
            locale={data.localeCode}
            href="/article/{slot.article.canonicalSlug}"
            variant="brief"
            dictionary={scoped}
          />
        {/each}
      </aside>
    {/if}
  </div>

  {#if data.latest.length > 0}
    <section class="front__latest" aria-labelledby="front-latest">
      <h2 class="front__heading" id="front-latest">{t('content.front.latest')}</h2>
      <div class="front__latest-grid">
        {#each data.latest as article (article.id)}
          <ArticleCard
            {article}
            {mediaAssets}
            blocks={article.blocks}
            storageBaseUrl={data.storageBaseUrl}
            status={article.status}
            bylines={article.bylines}
            sections={article.sections}
            topics={article.topics}
            locale={data.localeCode}
            href="/article/{article.canonicalSlug}"
            variant="brief"
            dictionary={scoped}
          />
        {/each}
      </div>
    </section>
  {/if}
</main>

<style>
  /* Developer CSS: unlayered, so it wins over every coreui @layer without
     specificity fights. Structure and rhythm only — the cards style themselves. */
  .front {
    max-width: 72rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 4rem;
  }

  .front__masthead {
    text-align: center;
    padding-block: 1rem 1.25rem;
    border-bottom: 3px double var(--border-color);
  }

  .front__nameplate {
    margin: 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: clamp(2.25rem, 7vw, 4rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }

  .front__date {
    margin: 0.5rem 0 0;
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-soft);
  }

  .front__sections {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem 1.5rem;
    padding-block: 0.75rem;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 2rem;
  }

  .front__top {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 2rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--border-color);
  }

  .front__secondaries {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    border-left: 1px solid var(--border-color);
    padding-left: 2rem;
  }

  .front__body {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 2rem;
    padding-block: 2rem;
  }

  .front__river {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .front__briefs {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border-left: 1px solid var(--border-color);
    padding-left: 2rem;
  }

  .front__heading {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid currentColor;
  }

  .front__latest {
    padding-top: 2rem;
    border-top: 1px solid var(--border-color);
  }

  .front__latest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1.5rem;
  }

  @media (max-width: 52rem) {
    .front__top,
    .front__body {
      grid-template-columns: 1fr;
    }

    .front__secondaries,
    .front__briefs {
      border-left: none;
      padding-left: 0;
      border-top: 1px solid var(--border-color);
      padding-top: 1.5rem;
    }
  }
</style>

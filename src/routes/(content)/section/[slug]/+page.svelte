<script lang="ts">
  import { goto } from '$app/navigation';
  import { createDictionary } from 'diglossia';
  import { Pagination } from '@sveltebuilder/coreui';
  import { ArticleCard, SectionLabel } from '@sveltebuilder/content';
  import type { SectionPageView } from '@sveltebuilder/content/views';

  let { data }: { data: SectionPageView } = $props();

  // Request-scoped, not a merge into the context instance — see the article screen.
  const scoped = $derived(createDictionary(data.copy));
  const t = (slug: string) => scoped.localText(slug, 'content');

  const sectionName = $derived(scoped.localText('name', 'section', data.section.id));

  const href = (page: number) =>
    page > 1 ? `/section/${data.section.slug}?page=${page}` : `/section/${data.section.slug}`;
</script>

<svelte:head>
  <title>{sectionName}</title>
</svelte:head>

<main class="section-page">
  <header class="section-page__header">
    <h1 class="section-page__title">{sectionName}</h1>

    {#if data.childSections.length > 0}
      <nav class="section-page__children" aria-label={t('content.section.subsections')}>
        {#each data.childSections as child (child.id)}
          <!-- Camp 2 component: it resolves the section's name from the dictionary itself. -->
          <SectionLabel
            section={child}
            locale={data.localeCode}
            href="/section/{child.slug}"
            dictionary={scoped}
          />
        {/each}
      </nav>
    {/if}
  </header>

  {#if data.articles.length > 0}
    <div class="section-page__river">
      {#each data.articles as article, index (article.id)}
        <!-- The first article leads the page; the rest run as a river. This is the one piece
             of editorial judgement a listing makes without a curated front. -->
        <ArticleCard
          {article}
          status={article.status}
          bylines={article.bylines}
          sections={article.sections}
          topics={article.topics}
          locale={data.localeCode}
          href="/article/{article.canonicalSlug}"
          variant={index === 0 ? 'lead' : 'river'}
          dictionary={scoped}
        />
      {/each}
    </div>

    {#if data.total > data.perPage}
      <nav class="section-page__pagination" aria-label={t('content.section.pagination')}>
        <!-- Server-side paging, so a page change is a navigation: the loader owns the slice and
             a shared URL has to land on the same one. -->
        <Pagination
          count={data.total}
          perPage={data.perPage}
          page={data.page}
          onPageChange={(next) => goto(href(next))}
        />
      </nav>
    {/if}
  {:else}
    <p class="section-page__empty">{t('content.section.empty')}</p>
  {/if}
</main>

<style>
  .section-page {
    max-width: 80rem;
    margin-inline: auto;
    padding: var(--space-8) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .section-page__header {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .section-page__title {
    margin: 0;
    font-size: var(--text-3xl);
    font-weight: var(--weight-bold);
    color: var(--color-text-primary);
  }

  .section-page__children {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .section-page__river {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .section-page__empty {
    margin: 0;
    color: var(--color-text-secondary);
  }
</style>

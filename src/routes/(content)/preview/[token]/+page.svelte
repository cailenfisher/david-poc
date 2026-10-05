<script lang="ts">
  import { createDictionary } from 'diglossia';
  import { InlineNotification } from '@sveltebuilder/coreui';
  import { ArticleView } from '@sveltebuilder/content';
  import type { PreviewPageView } from '@sveltebuilder/content/views';

  let { data }: { data: PreviewPageView } = $props();

  const scoped = $derived(createDictionary(data.copy));
  const t = (slug: string) => scoped.localText(slug, 'content');

  const headline = $derived(scoped.localText('headline', 'article', data.article.id));
</script>

<svelte:head>
  <!-- An unpublished article behind a shareable link: keep it out of every index. The link is
       the only thing protecting it, so a crawler following one must not make it permanent. -->
  <meta name="robots" content="noindex, nofollow" />
  <title>{t('content.preview.title_prefix')} {headline}</title>
</svelte:head>

<div class="preview-page">
  <!-- role="status" rather than "alert": this is a standing condition of the page, not an
       interruption, and an alert would preempt the headline for a screen reader. -->
  <InlineNotification severity="warning" summary={t('content.preview.banner')} />

  <main class="preview-page__article">
    <ArticleView
      article={data.article}
      mediaAssets={new Map(data.mediaAssets.map((asset) => [asset.id, asset]))}
      attributions={new Map(data.attributions.map((row) => [row.mediaAssetId, row]))}
      storageBaseUrl={data.storageBaseUrl}
      locale={data.localeCode}
      dictionary={scoped}
    />
  </main>
</div>

<style>
  .preview-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
  }

  .preview-page__article {
    max-width: 48rem;
    margin-inline: auto;
    width: 100%;
  }
</style>

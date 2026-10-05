<script lang="ts">
  import { createDictionary } from 'diglossia';
  import { Button, Field, InlineNotification, Input, Textarea } from '@sveltebuilder/coreui';
  import { ArticleView, LiveCoverageView } from '@sveltebuilder/content';
  import { buildArticleMetaTags, buildNewsArticleJsonLd } from '@sveltebuilder/content/publishing';
  import type { ScreenFormResult } from '@sveltebuilder/content/views';
  import type { ArticlePageWithCoverage } from './coverage-view';

  let { data, form }: { data: ArticlePageWithCoverage; form?: ScreenFormResult } = $props();

  // A fresh instance from this screen's payload, not `getDictionary().merge(...)`. Merging
  // would mutate the dictionary the root layout put in context, which on the server is shared
  // by everything rendering that request and on the client accumulates every article the
  // reader has visited. createDictionary() is request-scoped by construction.
  const scoped = $derived(createDictionary(data.copy));
  const t = (slug: string) => scoped.localText(slug, 'content');

  const siteUrl = $derived(new URL(data.canonicalUrl).origin);

  // Keyed by id for the components and the structured-data builders, which both take a lookup
  // rather than assets embedded on each block.
  const mediaAssets = $derived(new Map(data.mediaAssets.map((asset) => [asset.id, asset])));
  const attributions = $derived(new Map(data.attributions.map((row) => [row.mediaAssetId, row])));

  // Both builders are pure: entities and a dictionary in, plain objects out. They live in
  // @sveltebuilder/content/publishing rather than a server entry point for that reason.
  const structuredDataOptions = $derived({
    siteUrl,
    locale: data.localeCode,
    storageBaseUrl: data.storageBaseUrl,
    mediaAssets,
  });

  const jsonLd = $derived(
    data.publisherProfile
      ? buildNewsArticleJsonLd(data.article, data.publisherProfile, scoped, structuredDataOptions)
      : null
  );

  const metaTags = $derived(
    data.publisherProfile
      ? buildArticleMetaTags(data.article, data.publisherProfile, scoped, structuredDataOptions)
      : {}
  );

  const commentAccepted = $derived(form?.success === true);
</script>

<svelte:head>
  <title>{scoped.localText('headline', 'article', data.article.id)}</title>
  <link rel="canonical" href={data.canonicalUrl} />
  {#each Object.entries(metaTags) as [key, value] (key)}
    {#if key === 'canonical'}
      <!-- Emitted above from the loader's own canonicalUrl, so it is not repeated here. -->
    {:else if key.startsWith('twitter:')}
      <meta name={key} content={value} />
    {:else}
      <meta property={key} content={value} />
    {/if}
  {/each}
  {#if jsonLd}
    <!-- Split so the closing tag cannot terminate this script block early. -->
    {@html `<script type="application/ld+json">${JSON.stringify(jsonLd)}</` + `script>`}
  {/if}
</svelte:head>

<main class="article-page">
  <!-- Camp 2 component: it resolves the headline, dek and every block's text from the
       dictionary by entity id, so it takes this screen's instance rather than context. -->
  <ArticleView
    article={data.article}
    {mediaAssets}
    {attributions}
    storageBaseUrl={data.storageBaseUrl}
    locale={data.localeCode}
    dictionary={scoped}
  >
    {#snippet after()}
      {#if data.liveCoverage && data.liveCoverage.updates.length > 0}
        <section class="article-page__live" aria-label={t('content.live.heading')}>
          <h2 class="article-page__live-heading">
            {t('content.live.heading')}
            <span class="article-page__live-state">
              {data.liveCoverage.active ? t('content.live.updating') : t('content.live.ended')}
            </span>
          </h2>
          <LiveCoverageView
            coverage={data.liveCoverage}
            locale={data.localeCode}
            dictionary={scoped}
          />
        </section>
      {/if}

      {#if data.article.allowComment}
        <section class="article-page__comments" aria-label={t('content.comments.heading')}>
          <h2 class="article-page__comments-heading">{t('content.comments.heading')}</h2>

          {#if data.comments.length > 0}
            <ol class="article-page__comment-list">
              {#each data.comments as comment (comment.id)}
                <li class="article-page__comment">
                  <p class="article-page__comment-author">{comment.authorName}</p>
                  <p class="article-page__comment-body">{comment.body}</p>
                </li>
              {/each}
            </ol>
          {/if}

          {#if commentAccepted}
            <!-- role="status" rather than an alert: a successful submission is confirmation,
                 not a problem, and should not interrupt a screen reader. -->
            <InlineNotification severity="success" summary={t('content.comments.pending')} />
          {:else}
            <form class="article-page__comment-form" method="POST" action="?/comment">
              <h3 class="article-page__comment-form-heading">{t('content.comments.leave')}</h3>

              {#if form?.error}
                <InlineNotification severity="error" summary={form.error} />
              {/if}

              <Field label={t('content.comments.name')} id="comment-name" required>
                <Input name="author_name" required />
              </Field>
              <Field label={t('content.comments.email')} id="comment-email" required>
                <Input name="author_email" type="email" required />
              </Field>
              <Field label={t('content.comments.body')} id="comment-body" required>
                <Textarea name="body" rows={5} required />
              </Field>

              <!-- No status field: a comment is created pending, and the RLS insert policy is
                   what enforces that rather than this form omitting it. -->
              <Button type="submit" variant="primary">{t('content.comments.submit')}</Button>
            </form>
          {/if}
        </section>
      {/if}
    {/snippet}
  </ArticleView>
</main>

<style>
  .article-page {
    padding: var(--space-8) var(--space-4);
  }

  .article-page__live {
    margin-block: 2.5rem;
    padding-top: 1.5rem;
    border-top: 3px double var(--border-color);
  }

  .article-page__live-heading {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin: 0 0 1rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .article-page__live-state {
    font-weight: 400;
    letter-spacing: 0.04em;
    color: var(--text-soft);
  }

  .article-page__comments {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-block-start: var(--space-8);
    max-width: 40rem;
  }

  .article-page__comments-heading {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    color: var(--text);
  }

  .article-page__comment-form-heading {
    margin: 0;
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    color: var(--text);
  }

  .article-page__comment-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .article-page__comment-author {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--text);
  }

  .article-page__comment-body {
    margin: var(--space-1) 0 0;
    color: var(--text-soft);
  }

  .article-page__comment-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
</style>

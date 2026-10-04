<script lang="ts">
  import { enhance } from '$app/forms'
  import { createDictionary } from 'diglossia'
  import { Badge, Button, InlineNotification } from '@sveltebuilder/coreui'
  import type { ScreenFormResult } from '@sveltebuilder/content/views'
  import type { PageData } from './$types'

  let { data, form }: { data: PageData; form?: ScreenFormResult } = $props()

  const scoped = $derived(createDictionary(data.copy))
  const t = (slug: string) => scoped.localText(slug, 'content')

  // Pending first: that is the queue. Everything else is history, newest first,
  // which the loader already ordered.
  const ordered = $derived([
    ...data.comments.filter((comment) => comment.status === 'pending'),
    ...data.comments.filter((comment) => comment.status !== 'pending'),
  ])

  const pendingCount = $derived(
    data.comments.filter((comment) => comment.status === 'pending').length
  )

  const badgeVariant = (status: string) =>
    status === 'approved'
      ? 'success'
      : status === 'rejected'
        ? 'danger'
        : status === 'flagged'
          ? 'warning'
          : 'default'

  const dateFormat = $derived(
    new Intl.DateTimeFormat(data.localeCode, { dateStyle: 'medium', timeStyle: 'short' })
  )
</script>

<svelte:head>
  <title>{t('content.comment.title')}</title>
</svelte:head>

<div class="moderation">
  <header class="moderation__header">
    <h1 class="moderation__title">{t('content.comment.title')}</h1>
    {#if pendingCount > 0}
      <Badge variant="warning">{pendingCount} {t('content.comment.pending')}</Badge>
    {/if}
  </header>

  {#if form?.error}
    <InlineNotification severity="error" summary={form.error} />
  {/if}

  {#if ordered.length === 0}
    <p class="moderation__empty">{t('content.comment.empty')}</p>
  {:else}
    <ul class="moderation__list">
      {#each ordered as comment (comment.id)}
        <li class="moderation__item" class:moderation__item--pending={comment.status === 'pending'}>
          <div class="moderation__meta">
            <strong>{comment.authorName}</strong>
            <span class="moderation__email">{comment.authorEmail}</span>
            <Badge variant={badgeVariant(comment.status)} size="sm">{comment.status}</Badge>
            <span class="moderation__date">
              {dateFormat.format(new Date(comment.createdAt))}
            </span>
          </div>

          <p class="moderation__body">{comment.body}</p>

          <p class="moderation__article">
            {t('content.comment.on_article')}
            <a href="/article/{comment.articleSlug}">
              {scoped.localText('headline', 'article', comment.articleId)}
            </a>
          </p>

          <div class="moderation__actions">
            {#if comment.status !== 'approved'}
              <form method="POST" action="?/moderate" use:enhance>
                <input type="hidden" name="comment_id" value={comment.id} />
                <input type="hidden" name="status" value="approved" />
                <Button type="submit" size="sm" variant="secondary">
                  {t('content.comment.approve')}
                </Button>
              </form>
            {/if}
            {#if comment.status !== 'rejected'}
              <form method="POST" action="?/moderate" use:enhance>
                <input type="hidden" name="comment_id" value={comment.id} />
                <input type="hidden" name="status" value="rejected" />
                <Button type="submit" size="sm" variant="danger">
                  {t('content.comment.reject')}
                </Button>
              </form>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .moderation {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 56rem;
  }

  .moderation__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .moderation__title {
    margin: 0;
    font-size: 1.5rem;
  }

  .moderation__list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .moderation__item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius);
  }

  .moderation__item--pending {
    border-left-width: 3px;
    border-left-color: var(--text-warning, orange);
  }

  .moderation__meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.8125rem;
  }

  .moderation__email,
  .moderation__date {
    color: var(--text-soft, inherit);
  }

  .moderation__email,
  .moderation__body {
    overflow-wrap: anywhere;
  }

  .moderation__body {
    margin: 0;
    line-height: 1.5;
  }

  .moderation__article {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-soft, inherit);
  }

  .moderation__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .moderation__empty {
    margin: 0;
    color: var(--text-soft, inherit);
  }
</style>

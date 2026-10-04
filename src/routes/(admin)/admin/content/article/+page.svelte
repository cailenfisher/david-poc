<script lang="ts">
  import { goto } from '$app/navigation';
  import { createDictionary } from 'diglossia';
  import { getDictionary } from 'diglossia/svelte';
  import {
    Badge,
    Button,
    DataTable,
    Dialog,
    Field,
    InlineNotification,
    Input,
  } from '@sveltebuilder/coreui';
  import type { DataTableColumn } from '@sveltebuilder/coreui';
  import type {
    AdminArticleListView,
    ArticleRow,
    ScreenFormResult,
  } from '@sveltebuilder/content/views';

  let { data, form }: { data: AdminArticleListView; form?: ScreenFormResult } = $props();

  const dictionary = getDictionary();
  const scoped = $derived(createDictionary(data.copy));
  const t = (slug: string) => scoped.localText(slug, 'content');

  let newArticleOpen = $state(false);

  const columns: DataTableColumn[] = $derived([
    { key: 'headline', label: t('content.admin.headline') },
    { key: 'status', label: t('content.admin.status') },
    { key: 'slug', label: t('content.admin.slug') },
    { key: 'created', label: t('content.admin.created') },
  ]);

  const href = (statusSlug: string | null, page = 1) => {
    const params = new URLSearchParams();
    if (statusSlug !== null) params.set('status', statusSlug);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return `/admin/content/article${query ? `?${query}` : ''}`;
  };

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(data.localeCode, { dateStyle: 'medium' }).format(new Date(iso));
</script>

{#snippet articleCell(row: ArticleRow, column: DataTableColumn)}
  {#if column.key === 'headline'}
    <a href="/admin/content/article/{row.id}" class="admin-article-list__link">
      {scoped.localText('headline', 'article', row.id)}
    </a>
  {:else if column.key === 'status'}
    <Badge variant={row.status.slug === 'published' ? 'success' : 'default'}>
      {scoped.localText('name', 'article_status', row.status.id)}
    </Badge>
  {:else if column.key === 'slug'}
    <code class="admin-article-list__slug">{row.canonicalSlug}</code>
  {:else if column.key === 'created'}
    {formatDate(row.createdAt)}
  {/if}
{/snippet}

<svelte:head>
  <title>{t('content.admin.articles')}</title>
</svelte:head>

<div class="admin-article-list">
  <header class="admin-article-list__header">
    <h1 class="admin-article-list__title">{t('content.admin.articles')}</h1>
    <Button variant="primary" onclick={() => (newArticleOpen = true)}>
      {t('content.admin.new')}
    </Button>
  </header>

  {#if form?.error}
    <InlineNotification severity="error" summary={form.error} />
  {/if}

  <!-- Links in a nav, not tabs: the filter is server-side, so each option is a navigation to a
       different URL rather than a panel swap, and aria-current is what says which is on. -->
  <nav class="admin-article-list__filters" aria-label={t('content.admin.filter_status')}>
    <Button
      href={href(null)}
      variant={data.statusSlug === null ? 'secondary' : 'ghost'}
      size="sm"
      aria-current={data.statusSlug === null ? 'page' : undefined}
    >
      {t('content.admin.filter_all')}
    </Button>
    {#each data.statuses as status (status.id)}
      <Button
        href={href(status.slug)}
        variant={data.statusSlug === status.slug ? 'secondary' : 'ghost'}
        size="sm"
        aria-current={data.statusSlug === status.slug ? 'page' : undefined}
      >
        {scoped.localText('name', 'article_status', status.id)}
      </Button>
    {/each}
  </nav>

  <DataTable
    {columns}
    rows={data.articles}
    rowKey={(row) => row.id}
    cell={articleCell}
    page={data.page}
    perPage={data.perPage}
    total={data.total}
    onPageChange={(next) => goto(href(data.statusSlug, next))}
    emptyLabel={t('content.admin.empty')}
  />
</div>

<Dialog bind:open={newArticleOpen} title={t('content.admin.new')}>
  {#snippet children()}
    <form method="POST" action="?/create" class="admin-article-list__form">
      <!-- Both fields are required: an article with no headline cannot be told apart from its
           siblings in the list above, which is the only place an editor will look for it. -->
      <Field label={t('content.admin.headline')} id="new-headline" required>
        <Input name="headline" required />
      </Field>
      <Field label={t('content.admin.slug')} id="new-slug" required>
        <Input name="canonical_slug" required />
      </Field>

      <div class="admin-article-list__form-actions">
        <Button variant="ghost" onclick={() => (newArticleOpen = false)}>
          {dictionary.localText('action.cancel')}
        </Button>
        <Button type="submit" variant="primary">{t('content.admin.create')}</Button>
      </div>
    </form>
  {/snippet}
</Dialog>

<style>
  .admin-article-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: 72rem;
    margin-inline: auto;
  }

  .admin-article-list__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .admin-article-list__title {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    color: var(--text);
    margin: 0;
  }

  .admin-article-list__filters {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .admin-article-list__link {
    color: var(--text);
    font-weight: var(--weight-medium);
  }

  .admin-article-list__slug {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--text-soft);
  }

  .admin-article-list__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .admin-article-list__form-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }
</style>

<script lang="ts">
  import { getDictionary } from 'diglossia/svelte'
  import { Button, LocalTextEdit } from '@sveltebuilder/coreui'
  import type { PageData, ActionData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const dictionary = getDictionary()

  const editLabel  = $derived(dictionary.localText('admin.local_text.edit'))
  const slugLabel  = $derived(dictionary.localText('admin.local_text.slug'))
  const scopeLabel = $derived(dictionary.localText('admin.local_text.scope'))

  function translationFor(localeId: number): string {
    return data.translations.find((t) => t.locale === localeId)?.content ?? ''
  }
</script>

<div class="local-text-edit-page">
  <header class="local-text-edit-page__header">
    <Button href="/admin/local-text" variant="ghost" size="sm">← {dictionary.localText('nav.back')}</Button>
    <h1 class="local-text-edit-page__title">{editLabel}</h1>
  </header>

  <dl class="local-text-edit-page__meta">
    <dt>{slugLabel}</dt>
    <dd><code>{data.entry.slug}</code></dd>
    <dt>{scopeLabel}</dt>
    <dd>{data.entry.scope ?? '—'}</dd>
  </dl>

  {#if form?.error}
    <p class="local-text-edit-page__error" role="alert">{form.error}</p>
  {/if}
  {#if form?.success}
    <p class="local-text-edit-page__success" role="status">{dictionary.localText('feedback.saved')}</p>
  {/if}

  <div class="local-text-edit-page__translations">
    {#each data.locales as locale (locale.id)}
      <form method="post" action="?/update" class="local-text-edit-page__locale-form">
        <LocalTextEdit
          {slugLabel}
          localeLabel={locale.nativeName}
          contentLabel={dictionary.localText('admin.local_text.content')}
          locales={[locale]}
          slug={data.entry.slug}
          localeId={locale.id}
          content={translationFor(locale.id)}
          slugReadonly={true}
        />
        <Button type="submit" size="sm">{dictionary.localText('action.save')}</Button>
      </form>
    {/each}
  </div>

  <div class="local-text-edit-page__danger">
    <form method="post" action="?/delete">
      <Button type="submit" variant="danger" size="sm">
        {dictionary.localText('action.delete')} {editLabel}
      </Button>
    </form>
  </div>
</div>

<style>
  .local-text-edit-page {
    max-width: 40rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .local-text-edit-page__header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .local-text-edit-page__title {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .local-text-edit-page__meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-4);
    font-size: var(--text-sm);
    margin: 0;
  }

  .local-text-edit-page__meta dt {
    color: var(--color-text-secondary);
    font-weight: var(--weight-medium);
  }

  .local-text-edit-page__meta code {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background-color: var(--color-surface-overlay);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
  }

  .local-text-edit-page__error {
    color: var(--color-danger-text);
    font-size: var(--text-sm);
    margin: 0;
  }

  .local-text-edit-page__success {
    color: var(--color-success-text);
    font-size: var(--text-sm);
    margin: 0;
  }

  .local-text-edit-page__translations {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .local-text-edit-page__locale-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
  }

  .local-text-edit-page__danger {
    padding-block-start: var(--space-6);
    border-block-start: 1px solid var(--color-border-default);
  }
</style>

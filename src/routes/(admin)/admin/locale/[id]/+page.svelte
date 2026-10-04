<script lang="ts">
  import { getDictionary } from 'diglossia/svelte'
  import { Button, LocaleEdit } from '@sveltebuilder/coreui'
  import type { PageData, ActionData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const dictionary = getDictionary()

  const editLabel   = $derived(dictionary.localText('admin.locale.edit'))
  const codeLabel   = $derived(dictionary.localText('admin.locale.code'))
  const nameLabel   = $derived(dictionary.localText('admin.locale.name'))
  const nativeLabel = $derived(dictionary.localText('admin.locale.native_name'))
  const dirLabel    = $derived(dictionary.localText('admin.locale.dir'))
  const ltrLabel    = $derived(dictionary.localText('admin.locale.dir.ltr'))
  const rtlLabel    = $derived(dictionary.localText('admin.locale.dir.rtl'))
</script>

<div class="locale-edit-page">
  <header class="locale-edit-page__header">
    <Button href="/admin/locale" variant="ghost" size="sm">← {dictionary.localText('nav.back')}</Button>
    <h1 class="locale-edit-page__title">{editLabel}</h1>
  </header>

  {#if form?.error}
    <p class="locale-edit-page__error" role="alert">{form.error}</p>
  {/if}
  {#if form?.success}
    <p class="locale-edit-page__success" role="status">{dictionary.localText('feedback.saved')}</p>
  {/if}

  <form method="post" action="?/update" class="locale-edit-page__form">
    <LocaleEdit
      {codeLabel}
      {nameLabel}
      nativeNameLabel={nativeLabel}
      {dirLabel}
      {ltrLabel}
      {rtlLabel}
      code={data.locale.code}
      name={data.locale.name}
      nativeName={data.locale.nativeName}
      dir={data.locale.dir as 'ltr' | 'rtl'}
    />
    <Button type="submit">{dictionary.localText('action.save')}</Button>
  </form>

  <div class="locale-edit-page__danger">
    <form method="post" action="?/delete">
      <Button type="submit" variant="danger" size="sm">
        {dictionary.localText('action.delete')} {editLabel}
      </Button>
    </form>
  </div>
</div>

<style>
  .locale-edit-page {
    max-width: 32rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .locale-edit-page__header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .locale-edit-page__title {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .locale-edit-page__error {
    color: var(--color-danger-text);
    font-size: var(--text-sm);
    margin: 0;
  }

  .locale-edit-page__success {
    color: var(--color-success-text);
    font-size: var(--text-sm);
    margin: 0;
  }

  .locale-edit-page__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .locale-edit-page__danger {
    padding-block-start: var(--space-6);
    border-block-start: 1px solid var(--color-border-default);
  }
</style>

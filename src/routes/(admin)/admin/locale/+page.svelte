<script lang="ts">
  import { getDictionary } from 'diglossia/svelte'
  import {
    Button,
    Table, TableHead, TableBody, TableRow, TableHeader, TableCell,
    LocaleEdit,
  } from '@sveltebuilder/coreui'
  import type { PageData, ActionData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const dictionary = getDictionary()

  const title       = $derived(dictionary.localText('admin.locale.title'))
  const newLabel    = $derived(dictionary.localText('admin.locale.new'))
  const codeLabel   = $derived(dictionary.localText('admin.locale.code'))
  const nameLabel   = $derived(dictionary.localText('admin.locale.name'))
  const nativeLabel = $derived(dictionary.localText('admin.locale.native_name'))
  const dirLabel    = $derived(dictionary.localText('admin.locale.dir'))
  const ltrLabel    = $derived(dictionary.localText('admin.locale.dir.ltr'))
  const rtlLabel    = $derived(dictionary.localText('admin.locale.dir.rtl'))
  const deleteLabel = $derived(dictionary.localText('action.delete'))
  const editLabel   = $derived(dictionary.localText('action.edit'))
</script>

<div class="locale-admin">
  <header class="locale-admin__header">
    <h1 class="locale-admin__title">{title}</h1>
  </header>

  <section class="locale-admin__add">
    <h2 class="locale-admin__section-title">{newLabel}</h2>

    {#if form?.error}
      <p class="locale-admin__error" role="alert">{form.error}</p>
    {/if}
    {#if form?.success}
      <p class="locale-admin__success" role="status">{dictionary.localText('feedback.saved')}</p>
    {/if}

    <form method="post" action="?/create" class="locale-admin__form">
      <LocaleEdit
        {codeLabel}
        {nameLabel}
        nativeNameLabel={nativeLabel}
        {dirLabel}
        {ltrLabel}
        {rtlLabel}
      />
      <Button type="submit">{newLabel}</Button>
    </form>
  </section>

  <div class="locale-admin__table-wrap">
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>{codeLabel}</TableHeader>
          <TableHeader>{nameLabel}</TableHeader>
          <TableHeader>{nativeLabel}</TableHeader>
          <TableHeader>{dirLabel}</TableHeader>
          <TableHeader>
            <span class="sr-only">{dictionary.localText('table.actions')}</span>
          </TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {#if data.locales.length === 0}
          <TableRow>
            <TableCell colspan={5}>{dictionary.localText('feedback.empty')}</TableCell>
          </TableRow>
        {/if}
        {#each data.locales as locale (locale.id)}
          <TableRow>
            <TableCell><code class="locale-admin__code">{locale.code}</code></TableCell>
            <TableCell>{locale.name}</TableCell>
            <TableCell>{locale.nativeName}</TableCell>
            <TableCell>{locale.dir}</TableCell>
            <TableCell>
              <div class="locale-admin__row-actions">
                <Button href="/admin/locale/{locale.id}" variant="ghost" size="sm">
                  {editLabel}
                </Button>
                <form method="post" action="?/delete">
                  <input type="hidden" name="id" value={locale.id} />
                  <Button type="submit" variant="danger" size="sm">{deleteLabel}</Button>
                </form>
              </div>
            </TableCell>
          </TableRow>
        {/each}
      </TableBody>
    </Table>
  </div>
</div>

<style>
  .locale-admin {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    max-width: 56rem;
    margin-inline: auto;
  }

  .locale-admin__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .locale-admin__title {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .locale-admin__section-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
    margin: 0 0 var(--space-4);
  }

  .locale-admin__add {
    padding: var(--space-6);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    background-color: var(--color-surface-raised);
  }

  .locale-admin__error {
    color: var(--color-danger-text);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-4);
  }

  .locale-admin__success {
    color: var(--color-success-text);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-4);
  }

  .locale-admin__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .locale-admin__table-wrap {
    overflow-x: auto;
  }

  .locale-admin__code {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background-color: var(--color-surface-overlay);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
  }

  .locale-admin__row-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>

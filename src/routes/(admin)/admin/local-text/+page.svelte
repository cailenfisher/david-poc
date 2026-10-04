<script lang="ts">
  import { getDictionary } from 'diglossia/svelte'
  import {
    Button, Field, Textarea,
    Table, TableHead, TableBody, TableRow, TableHeader, TableCell,
    LocalTextLinkEdit,
  } from '@sveltebuilder/coreui'
  import type { PageData, ActionData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const dictionary = getDictionary()

  const title       = $derived(dictionary.localText('admin.local_text.title'))
  const slugLabel   = $derived(dictionary.localText('admin.local_text.slug'))
  const scopeLabel  = $derived(dictionary.localText('admin.local_text.scope'))
  const newLabel    = $derived(dictionary.localText('admin.local_text.new'))
  const deleteLabel = $derived(dictionary.localText('action.delete'))
  const editLabel   = $derived(dictionary.localText('action.edit'))

  function translationFor(linkId: number, localeId: number): string {
    return data.translations.find((t) => t.link === linkId && t.locale === localeId)?.content ?? '—'
  }

  function truncate(text: string, max = 48): string {
    return text.length > max ? text.slice(0, max) + '…' : text
  }
</script>

<div class="local-text-admin">
  <header class="local-text-admin__header">
    <h1 class="local-text-admin__title">{title}</h1>
  </header>

  <section class="local-text-admin__add">
    <h2 class="local-text-admin__section-title">{newLabel}</h2>

    {#if form?.error}
      <p class="local-text-admin__error" role="alert">{form.error}</p>
    {/if}
    {#if form?.success}
      <p class="local-text-admin__success" role="status">{dictionary.localText('feedback.saved')}</p>
    {/if}

    <form method="post" action="?/create" class="local-text-admin__form">
      <LocalTextLinkEdit {slugLabel} {scopeLabel} />

      <div class="local-text-admin__locales">
        {#each data.locales as locale (locale.id)}
          <div class="local-text-admin__locale-field">
            <input type="hidden" name="locale_id" value={locale.id} />
            <Field label={locale.nativeName} id="content_{locale.id}">
              <Textarea id="content_{locale.id}" name="content" rows={2} />
            </Field>
          </div>
        {/each}
      </div>

      <Button type="submit">{newLabel}</Button>
    </form>
  </section>

  <div class="local-text-admin__table-wrap">
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>{slugLabel}</TableHeader>
          <TableHeader>{scopeLabel}</TableHeader>
          {#each data.locales as locale (locale.id)}
            <TableHeader>{locale.nativeName}</TableHeader>
          {/each}
          <TableHeader>
            <span class="sr-only">{dictionary.localText('table.actions')}</span>
          </TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {#if data.entries.length === 0}
          <TableRow>
            <TableCell colspan={3 + data.locales.length}>
              {dictionary.localText('feedback.empty')}
            </TableCell>
          </TableRow>
        {/if}
        {#each data.entries as entry (entry.id)}
          <TableRow>
            <TableCell>
              <a href="/admin/local-text/{entry.id}" class="local-text-admin__link">{entry.slug}</a>
            </TableCell>
            <TableCell>{entry.scope ?? '—'}</TableCell>
            {#each data.locales as locale (locale.id)}
              <TableCell class="local-text-admin__content-cell">
                {truncate(translationFor(entry.id, locale.id))}
              </TableCell>
            {/each}
            <TableCell>
              <div class="local-text-admin__row-actions">
                <Button href="/admin/local-text/{entry.id}" variant="ghost" size="sm">
                  {editLabel}
                </Button>
                <form method="post" action="?/delete">
                  <input type="hidden" name="id" value={entry.id} />
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
  .local-text-admin {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    max-width: 72rem;
    margin-inline: auto;
  }

  .local-text-admin__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .local-text-admin__title {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .local-text-admin__section-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
    margin: 0 0 var(--space-4);
  }

  .local-text-admin__add {
    padding: var(--space-6);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    background-color: var(--color-surface-raised);
  }

  .local-text-admin__error {
    color: var(--color-danger-text);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-4);
  }

  .local-text-admin__success {
    color: var(--color-success-text);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-4);
  }

  .local-text-admin__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .local-text-admin__locales {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: var(--space-4);
  }

  .local-text-admin__table-wrap {
    overflow-x: auto;
  }

  .local-text-admin__link {
    color: var(--color-text-link);
    text-decoration: none;
    font-weight: var(--weight-medium);
    font-size: var(--text-sm);
  }

  .local-text-admin__link:hover {
    text-decoration: underline;
  }

  .local-text-admin__content-cell {
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .local-text-admin__row-actions {
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

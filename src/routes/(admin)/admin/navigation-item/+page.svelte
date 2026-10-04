<script lang="ts">
  import { getDictionary } from 'diglossia/svelte'
  import {
    Button, Field, Input,
    Table, TableHead, TableBody, TableRow, TableHeader, TableCell,
    LocalTextLinkEdit,
  } from '@sveltebuilder/coreui'
  import type { PageData, ActionData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const dictionary = getDictionary()

  const title       = $derived(dictionary.localText('admin.navigation_item.title'))
  const newLabel    = $derived(dictionary.localText('admin.navigation_item.new'))
  const hrefLabel   = $derived(dictionary.localText('admin.navigation_item.href'))
  const scopeLabel  = $derived(dictionary.localText('admin.navigation_item.scope'))
  const sortLabel   = $derived(dictionary.localText('admin.navigation_item.sort_order'))
  const slugLabel   = $derived(dictionary.localText('admin.local_text.slug'))
  const deleteLabel = $derived(dictionary.localText('action.delete'))
  const editLabel   = $derived(dictionary.localText('action.edit'))
  const activeLabel = $derived(dictionary.localText('admin.navigation_item.active'))
</script>

<div class="nav-item-admin">
  <header class="nav-item-admin__header">
    <h1 class="nav-item-admin__title">{title}</h1>
  </header>

  <section class="nav-item-admin__add">
    <h2 class="nav-item-admin__section-title">{newLabel}</h2>

    {#if form?.error}
      <p class="nav-item-admin__error" role="alert">{form.error}</p>
    {/if}
    {#if form?.success}
      <p class="nav-item-admin__success" role="status">{dictionary.localText('feedback.saved')}</p>
    {/if}

    <form method="post" action="?/create" class="nav-item-admin__form">
      <LocalTextLinkEdit {slugLabel} scopeLabel={dictionary.localText('admin.local_text.scope')} />

      <div class="nav-item-admin__form-row">
        <Field label={hrefLabel} id="nav-href" required>
          <Input id="nav-href" name="href" placeholder="/admin/example" required />
        </Field>
        <Field label={scopeLabel} id="nav-scope" required>
          <Input id="nav-scope" name="nav_scope" placeholder="admin" required />
        </Field>
        <Field label={sortLabel} id="nav-sort">
          <Input id="nav-sort" name="sort_order" type="number" value="0" />
        </Field>
      </div>

      <Button type="submit">{newLabel}</Button>
    </form>
  </section>

  <div class="nav-item-admin__table-wrap">
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>{slugLabel}</TableHeader>
          <TableHeader>{hrefLabel}</TableHeader>
          <TableHeader>{scopeLabel}</TableHeader>
          <TableHeader>{sortLabel}</TableHeader>
          <TableHeader>{activeLabel}</TableHeader>
          <TableHeader>
            <span class="sr-only">{dictionary.localText('table.actions')}</span>
          </TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {#if data.navItems.length === 0}
          <TableRow>
            <TableCell colspan={6}>{dictionary.localText('feedback.empty')}</TableCell>
          </TableRow>
        {/if}
        {#each data.navItems as item (item.id)}
          <TableRow>
            <TableCell>
              <code class="nav-item-admin__slug">{item.localTextLink?.slug ?? '—'}</code>
            </TableCell>
            <TableCell>{item.href}</TableCell>
            <TableCell>{item.scope}</TableCell>
            <TableCell>{item.sortOrder}</TableCell>
            <TableCell>{item.active ? '✓' : '—'}</TableCell>
            <TableCell>
              <div class="nav-item-admin__row-actions">
                <Button href="/admin/navigation-item/{item.id}" variant="ghost" size="sm">
                  {editLabel}
                </Button>
                <form method="post" action="?/delete">
                  <input type="hidden" name="id" value={item.id} />
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
  .nav-item-admin {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    max-width: 64rem;
    margin-inline: auto;
  }

  .nav-item-admin__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .nav-item-admin__title {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .nav-item-admin__section-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
    margin: 0 0 var(--space-4);
  }

  .nav-item-admin__add {
    padding: var(--space-6);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    background-color: var(--color-surface-raised);
  }

  .nav-item-admin__error {
    color: var(--color-danger-text);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-4);
  }

  .nav-item-admin__success {
    color: var(--color-success-text);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-4);
  }

  .nav-item-admin__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .nav-item-admin__form-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: var(--space-4);
  }

  .nav-item-admin__table-wrap {
    overflow-x: auto;
  }

  .nav-item-admin__slug {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background-color: var(--color-surface-overlay);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
  }

  .nav-item-admin__row-actions {
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

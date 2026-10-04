<script lang="ts">
  import { getDictionary } from 'diglossia/svelte'
  import { Button, Field, Input, Checkbox, LocalTextEdit } from '@sveltebuilder/coreui'
  import type { PageData, ActionData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const dictionary = getDictionary()

  const editLabel  = $derived(dictionary.localText('admin.navigation_item.edit'))
  const hrefLabel  = $derived(dictionary.localText('admin.navigation_item.href'))
  const scopeLabel = $derived(dictionary.localText('admin.navigation_item.scope'))
  const sortLabel  = $derived(dictionary.localText('admin.navigation_item.sort_order'))
  const slugLabel  = $derived(dictionary.localText('admin.local_text.slug'))

  function translationFor(localeId: number): string {
    return data.translations.find((t) => t.locale === localeId)?.content ?? ''
  }
</script>

<div class="nav-item-edit-page">
  <header class="nav-item-edit-page__header">
    <Button href="/admin/navigation-item" variant="ghost" size="sm">← {dictionary.localText('nav.back')}</Button>
    <h1 class="nav-item-edit-page__title">{editLabel}</h1>
  </header>

  <dl class="nav-item-edit-page__meta">
    <dt>{slugLabel}</dt>
    <dd><code>{data.navItem.localTextLink?.slug ?? '—'}</code></dd>
    <dt>{hrefLabel}</dt>
    <dd>{data.navItem.href}</dd>
  </dl>

  {#if form?.error}
    <p class="nav-item-edit-page__error" role="alert">{form.error}</p>
  {/if}
  {#if form?.success}
    <p class="nav-item-edit-page__success" role="status">{dictionary.localText('feedback.saved')}</p>
  {/if}

  <section class="nav-item-edit-page__section">
    <h2 class="nav-item-edit-page__section-title">{dictionary.localText('admin.navigation_item.edit')}</h2>
    <form method="post" action="?/update" class="nav-item-edit-page__form">
      <div class="nav-item-edit-page__form-row">
        <Field label={hrefLabel} id="nav-href" required>
          <Input id="nav-href" name="href" value={data.navItem.href} required />
        </Field>
        <Field label={scopeLabel} id="nav-scope" required>
          <Input id="nav-scope" name="scope" value={data.navItem.scope} required />
        </Field>
        <Field label={sortLabel} id="nav-sort">
          <Input id="nav-sort" name="sort_order" type="number" value={String(data.navItem.sortOrder)} />
        </Field>
      </div>
      <!-- Checkbox is self-labelling: it renders its own <label> around the control,
           so it takes the label directly rather than being wrapped in a Field. A
           Field here would nest one <label> inside another and leave the outer
           label's `for` pointing at no element. -->
      <Checkbox
        name="active"
        checked={data.navItem.active}
        label={dictionary.localText('admin.navigation_item.active')}
      />
      <Button type="submit">{dictionary.localText('action.save')}</Button>
    </form>
  </section>

  <section class="nav-item-edit-page__section">
    <h2 class="nav-item-edit-page__section-title">{dictionary.localText('admin.local_text.title')}</h2>
    <div class="nav-item-edit-page__translations">
      {#each data.locales as locale (locale.id)}
        <form method="post" action="?/updateText" class="nav-item-edit-page__locale-form">
          <LocalTextEdit
            {slugLabel}
            localeLabel={locale.nativeName}
            contentLabel={dictionary.localText('admin.local_text.content')}
            locales={[locale]}
            slug={data.navItem.localTextLink?.slug ?? ''}
            localeId={locale.id}
            content={translationFor(locale.id)}
            slugReadonly={true}
          />
          <Button type="submit" size="sm">{dictionary.localText('action.save')}</Button>
        </form>
      {/each}
    </div>
  </section>

  <div class="nav-item-edit-page__danger">
    <form method="post" action="?/delete">
      <Button type="submit" variant="danger" size="sm">
        {dictionary.localText('action.delete')} {editLabel}
      </Button>
    </form>
  </div>
</div>

<style>
  .nav-item-edit-page {
    max-width: 40rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .nav-item-edit-page__header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .nav-item-edit-page__title {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    color: var(--text);
    margin: 0;
  }

  .nav-item-edit-page__meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-4);
    font-size: var(--text-sm);
    margin: 0;
  }

  .nav-item-edit-page__meta dt {
    color: var(--text-soft);
    font-weight: var(--weight-medium);
  }

  .nav-item-edit-page__meta code {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background-color: var(--surface-overlay);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
  }

  .nav-item-edit-page__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .nav-item-edit-page__section-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--text);
    margin: 0;
  }

  .nav-item-edit-page__error {
    color: var(--danger-text);
    font-size: var(--text-sm);
    margin: 0;
  }

  .nav-item-edit-page__success {
    color: var(--success-text);
    font-size: var(--text-sm);
    margin: 0;
  }

  .nav-item-edit-page__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .nav-item-edit-page__form-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: var(--space-4);
  }

  .nav-item-edit-page__translations {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .nav-item-edit-page__locale-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
  }

  .nav-item-edit-page__danger {
    padding-block-start: var(--space-6);
    border-block-start: 1px solid var(--border-color);
  }
</style>

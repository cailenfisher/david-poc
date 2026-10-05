<script lang="ts">
  import { enhance } from '$app/forms'
  import { createDictionary } from 'diglossia'
  import { getDictionary } from 'diglossia/svelte'
  import {
    Badge,
    Button,
    Checkbox,
    Field,
    InlineNotification,
    Input,
    Select,
    SelectItem,
    Textarea,
  } from '@sveltebuilder/coreui'
  import MediaAssetEditor from '$lib/components/MediaAssetEditor.svelte'
  import MediaRightsFields from '$lib/components/MediaRightsFields.svelte'
  import type { SubmitFunction } from '@sveltejs/kit'
  import type { Locale } from 'diglossia'
  import type { ScreenFormResult } from '@sveltebuilder/content/views'
  import type { ArticleEditorView } from './editor-view'

  // `locales` comes from the root layout's load, not this screen's. App.PageData
  // types $page.data rather than a page's own PageData, so it is named explicitly
  // here — the copy forms need it to offer a language to write in.
  let {
    data,
    form,
  }: { data: ArticleEditorView & { locales: Locale[] }; form?: ScreenFormResult } = $props()

  // One form per checklist item, keyed by item id so the checkbox can submit its own.
  const checklistForms: Record<number, HTMLFormElement | undefined> = $state({})

  const dictionary = getDictionary()
  const scoped = $derived(createDictionary(data.copy))
  const t = (slug: string) => scoped.localText(slug, 'content')

  const article = $derived(data.article)
  const headline = $derived(scoped.localText('headline', 'article', article.id))

  // What the server will refuse, shown before the editor tries. The RPC enforces the same rule,
  // so this is a courtesy rather than the safeguard.
  const blockingItems = $derived(data.checklist.filter((item) => item.required && !item.completed))
  const publishable = $derived(blockingItems.length === 0)

  // Which locale the copy forms write. Defaults to the one the operator is reading the
  // admin in, so writing the French version is switching this rather than the whole UI.
  //
  // Deliberately the initial value only: once the operator picks a language, a form
  // round-trip must not reset it back to the UI locale mid-edit.
  // svelte-ignore state_referenced_locally
  let writingLocale = $state(data.localeCode)
  const writingLocaleId = $derived(
    data.locales.find((locale) => locale.code === writingLocale)?.id ?? null
  )

  // The copy fields show the chosen locale's text. localeOf tells us whether what came
  // back is actually that locale or a fallback from another one — a fallback must not be
  // presented as this locale's text, or saving would silently copy it across.
  const copyFor = (slug: string) => {
    const resolved = scoped.localText(slug, 'article', article.id)
    const from = scoped.localeOf(slug, 'article', article.id)
    return from === writingLocale ? resolved : ''
  }

  const headlineValue = $derived(copyFor('headline'))
  const dekValue = $derived(copyFor('dek'))

  const blockTypes = ['paragraph', 'heading', 'pullquote', 'image'] as const

  // Which kind of block the add form is building. Drives which fields exist, rather than
  // hiding them, so a field that is not in play can never block the submit by being required.
  let newBlockType = $state<(typeof blockTypes)[number]>('paragraph')

  // 'Upload new' or 'Use existing', for an image block.
  let imageSource = $state<'upload' | 'existing'>('upload')

  // Images: what an image block points at, and the chrome around its fields.
  const mediaAssetById = $derived(new Map(data.mediaAssets.map((asset) => [asset.id, asset])))

  const licenseOptions = $derived(
    Object.fromEntries(
      ['all_rights_reserved', 'rights_managed', 'royalty_free', 'creative_commons', 'public_domain'].map(
        (license) => [license, t(`content.admin.license.${license}`)]
      )
    )
  )

  const rightsLabels = $derived({
    license: t('content.admin.license'),
    licenseOptions,
    creditRequired: t('content.admin.credit_required'),
    sourceUrl: t('content.admin.source_url'),
    licenseUrl: t('content.admin.license_url'),
    retrievedAt: t('content.admin.retrieved_at'),
    expiresAt: t('content.admin.expires_at'),
  })

  const mediaLabels = $derived({
    ...rightsLabels,
    altText: t('content.admin.alt_text'),
    altTextHint: t('content.admin.alt_text_hint'),
    caption: t('content.admin.caption'),
    credit: t('content.admin.credit'),
    rights: t('content.admin.rights'),
    rightsMissing: t('content.admin.rights_missing'),
    save: dictionary.localText('action.save'),
  })

  // The picker names an image by its alt text in the writing locale, or its storage key when
  // it has none there.
  const assetLabel = (asset: ArticleEditorView['mediaAssets'][number]) =>
    scoped.localeOf('alt_text', 'media_asset', asset.id) === writingLocale
      ? scoped.localText('alt_text', 'media_asset', asset.id)
      : asset.storageKey

  const today = new Date().toISOString().slice(0, 10)

  // Errors for the add-image forms appear beside them, not in the page banner. A failure leaves
  // the typed values and the chosen file in place, which a banner-and-reset would not.
  let uploadError = $state('')
  let existingError = $state('')

  const enhanceInto =
    (setError: (message: string) => void): SubmitFunction =>
    () =>
    async ({ result, update }) => {
      if (result.type === 'failure') {
        setError(String(result.data?.error ?? ''))
        return
      }
      setError('')
      await update()
    }

  // Current filing and bylines, as id sets, so the pickers can mark what is selected.
  const selectedSections = $derived(new Set(article.sections.map((section) => section.id)))
  const selectedTopics = $derived(new Set(article.topics.map((topic) => topic.id)))
  const selectedTags = $derived(new Set(article.tags.map((tag) => tag.id)))
  const bylineIds = $derived(article.bylines.map((author) => author.id))

  const authorName = (id: number) => scoped.localText('name', 'author_profile', id)

  // datetime-local wants `YYYY-MM-DDTHH:mm` with no zone. The stored value is UTC, so it
  // is sliced from the ISO string rather than formatted locally — a local format would
  // shift the embargo by the operator's offset every time the form round-trips.
  const embargoValue = $derived(article.embargoUntil ? article.embargoUntil.slice(0, 16) : '')
</script>

<svelte:head>
  <title>{headline}</title>
</svelte:head>

<div class="admin-article">
  <header class="admin-article__header">
    <a href="/admin/content/article" class="admin-article__back">
      ← {t('content.admin.articles')}
    </a>
    <div class="admin-article__title-row">
      <h1 class="admin-article__title">{headline}</h1>
      <Badge variant={article.status.slug === 'published' ? 'success' : 'default'}>
        {scoped.localText('name', 'article_status', article.status.id)}
      </Badge>
    </div>
    <p class="admin-article__slug">
      <code>{article.canonicalSlug}</code>
      {#if article.status.slug === 'published'}
        <a href="/article/{article.canonicalSlug}" class="admin-article__public">
          {t('content.admin.view_public')} →
        </a>
      {/if}
    </p>
  </header>

  {#if form?.error}
    <InlineNotification severity="error" summary={form.error} />
  {:else if form?.success}
    <InlineNotification severity="success" summary={t('content.admin.saved')} />
  {/if}

  <div class="admin-article__columns">
    <div class="admin-article__main">
      <!-- ── Headline and dek ────────────────────────────────────────────── -->
      <section class="admin-article__section" aria-label={t('content.admin.copy')}>
        <div class="admin-article__section-head">
          <h2 class="admin-article__section-title">{t('content.admin.copy')}</h2>
          <label class="admin-article__locale">
            <span>{t('content.admin.locale_label')}</span>
            <select bind:value={writingLocale} class="select sm">
              {#each data.locales as locale (locale.id)}
                <option value={locale.code}>{locale.nativeName}</option>
              {/each}
            </select>
          </label>
        </div>

        <!-- Keyed on the locale so switching it rebuilds the inputs with that
             locale's text, rather than leaving the previous one's in the DOM. -->
        {#key writingLocale}
          <form method="POST" action="?/copy" class="admin-article__form-stack" use:enhance>
            <input type="hidden" name="locale_id" value={writingLocaleId} />

            <Field label={t('content.admin.headline_label')} id="headline" required>
              <Input name="headline" value={headlineValue} required />
            </Field>

            <Field label={t('content.admin.dek_label')} id="dek">
              <Textarea name="dek" value={dekValue} rows={2} />
            </Field>

            <div class="admin-article__actions">
              <Button type="submit" size="sm">{dictionary.localText('action.save')}</Button>
            </div>
          </form>
        {/key}
      </section>

      <!-- ── Body ────────────────────────────────────────────────────────── -->
      <section class="admin-article__section" aria-label={t('content.admin.body')}>
        <h2 class="admin-article__section-title">{t('content.admin.body')}</h2>

        {#if article.blocks.length > 0}
          <ol class="admin-article__blocks">
            {#each article.blocks as block, index (block.id)}
              <li class="admin-article__block">
                <div class="admin-article__block-body">
                <!-- Each block is its own form: saving one cannot lose edits to
                     another, and the body stays editable while a save is in flight. -->
                {#key writingLocale}
                  <form method="POST" action="?/block_save" use:enhance>
                    <input type="hidden" name="block_id" value={block.id} />
                    <input type="hidden" name="locale_id" value={writingLocaleId} />

                    <div class="admin-article__block-head">
                      <Select name="block_type" value={block.blockType}>
                        {#each blockTypes as type (type)}
                          <SelectItem value={type} label={type} />
                        {/each}
                      </Select>
                      <span class="admin-article__block-position">{index + 1}</span>
                    </div>

                    {#if block.blockType === 'image'}
                      <!-- An image block has no prose: its copy belongs to the asset. -->
                      <input type="hidden" name="media_asset_id" value={block.mediaAssetId} />
                    {:else}
                      <Textarea
                        name="text"
                        value={scoped.localeOf('text', 'article_block', block.id) === writingLocale
                          ? scoped.localText('text', 'article_block', block.id)
                          : ''}
                        rows={3}
                        aria-label={t('content.admin.block_text')}
                        required
                      />
                    {/if}

                    <div class="admin-article__block-actions">
                      <Button type="submit" size="sm" variant="secondary">
                        {dictionary.localText('action.save')}
                      </Button>
                    </div>
                  </form>
                {/key}

                {#if block.blockType === 'image' && block.mediaAssetId !== null}
                  {@const asset = mediaAssetById.get(block.mediaAssetId)}
                  {#if asset}
                    <MediaAssetEditor
                      {asset}
                      storageBaseUrl={data.storageBaseUrl}
                      localeId={writingLocaleId}
                      {writingLocale}
                      labels={mediaLabels}
                      dictionary={scoped}
                    />
                  {/if}
                {/if}
                </div>

                <div class="admin-article__block-move">
                  <form method="POST" action="?/block_move" use:enhance>
                    <input type="hidden" name="block_id" value={block.id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      disabled={index === 0}
                      aria-label={t('content.admin.move_up')}
                    >
                      ↑
                    </Button>
                  </form>
                  <form method="POST" action="?/block_move" use:enhance>
                    <input type="hidden" name="block_id" value={block.id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      disabled={index === article.blocks.length - 1}
                      aria-label={t('content.admin.move_down')}
                    >
                      ↓
                    </Button>
                  </form>
                  <form method="POST" action="?/block_delete" use:enhance>
                    <input type="hidden" name="block_id" value={block.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="danger"
                      aria-label={t('content.admin.delete')}
                    >
                      ✕
                    </Button>
                  </form>
                </div>
              </li>
            {/each}
          </ol>
        {:else}
          <p class="admin-article__empty">{t('content.admin.body_empty')}</p>
        {/if}

        <div class="admin-article__add-block">
          <h3 class="admin-article__subtitle">{t('content.admin.add_block')}</h3>

          <div class="admin-article__block-head">
            <Select bind:value={newBlockType}>
              {#each blockTypes as type (type)}
                <SelectItem value={type} label={type === 'image' ? t('content.admin.image') : type} />
              {/each}
            </Select>
          </div>

          {#if newBlockType === 'image'}
            <div class="admin-article__block-head">
              <Select bind:value={imageSource}>
                <SelectItem value="upload" label={t('content.admin.image_upload')} />
                <SelectItem
                  value="existing"
                  label={t('content.admin.image_existing')}
                  disabled={data.mediaAssets.length === 0}
                />
              </Select>
            </div>

            {#if imageSource === 'upload'}
              {#key writingLocale}
                <form
                  method="POST"
                  action="?/media_create"
                  enctype="multipart/form-data"
                  class="admin-article__form-stack"
                  use:enhance={enhanceInto((message) => (uploadError = message))}
                >
                  <input type="hidden" name="locale_id" value={writingLocaleId} />

                  <Field
                    label={t('content.admin.image')}
                    id="media-file"
                    hint={t('content.admin.image_file_hint')}
                    required
                  >
                    <Input
                      name="file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      required
                    />
                  </Field>
                  <Field label={t('content.admin.alt_text')} id="media-alt-text" hint={t('content.admin.alt_text_hint')} required>
                    <Input name="alt_text" required />
                  </Field>
                  <Field label={t('content.admin.caption')} id="media-caption">
                    <Textarea name="caption" rows={2} />
                  </Field>
                  <Field label={t('content.admin.credit')} id="media-credit">
                    <Input name="credit" />
                  </Field>

                  <!-- Expanded: a new upload has to state its rights. -->
                  <fieldset class="admin-article__fieldset">
                    <legend>{t('content.admin.rights')}</legend>
                    <MediaRightsFields
                      idPrefix="media-new"
                      labels={rightsLabels}
                      values={{
                        license: 'all_rights_reserved',
                        creditRequired: false,
                        sourceUrl: '',
                        licenseUrl: '',
                        retrievedAt: today,
                        expiresAt: '',
                      }}
                    />
                  </fieldset>

                  {#if uploadError}
                    <InlineNotification severity="error" summary={uploadError} />
                  {/if}

                  <div class="admin-article__actions">
                    <Button type="submit" size="sm">{t('content.admin.add_block')}</Button>
                  </div>
                </form>
              {/key}
            {:else}
              {#key writingLocale}
                <form
                  method="POST"
                  action="?/block_save"
                  class="admin-article__form-stack"
                  use:enhance={enhanceInto((message) => (existingError = message))}
                >
                  <input type="hidden" name="locale_id" value={writingLocaleId} />
                  <input type="hidden" name="block_type" value="image" />

                  <Field label={t('content.admin.image_existing')} id="media-existing" required>
                    <Select name="media_asset_id" value={String(data.mediaAssets[0]?.id ?? '')}>
                      {#each data.mediaAssets as asset (asset.id)}
                        <SelectItem value={String(asset.id)} label={assetLabel(asset)} />
                      {/each}
                    </Select>
                  </Field>

                  {#if existingError}
                    <InlineNotification severity="error" summary={existingError} />
                  {/if}

                  <div class="admin-article__actions">
                    <Button type="submit" size="sm">{t('content.admin.add_block')}</Button>
                  </div>
                </form>
              {/key}
            {/if}
          {:else}
            {#key writingLocale}
              <form method="POST" action="?/block_save" class="admin-article__form-stack" use:enhance>
                <input type="hidden" name="locale_id" value={writingLocaleId} />
                <input type="hidden" name="block_type" value={newBlockType} />

                {#if newBlockType === 'heading'}
                  <Select name="level" value="2">
                    <SelectItem value="2" label="H2" />
                    <SelectItem value="3" label="H3" />
                    <SelectItem value="4" label="H4" />
                  </Select>
                {/if}

                <Textarea
                  name="text"
                  rows={3}
                  aria-label={t('content.admin.block_new')}
                  placeholder={t('content.admin.block_new')}
                  required
                />

                <div class="admin-article__actions">
                  <Button type="submit" size="sm">{t('content.admin.add_block')}</Button>
                </div>
              </form>
            {/key}
          {/if}
        </div>
      </section>

      <!-- ── Bylines ─────────────────────────────────────────────────────── -->
      <section class="admin-article__section" aria-label={t('content.admin.bylines')}>
        <h2 class="admin-article__section-title">{t('content.admin.bylines')}</h2>
        <p class="admin-article__hint">{t('content.admin.byline_hint')}</p>

        <form method="POST" action="?/bylines" use:enhance>
          <!-- Submitted in list order, which is what set_article_bylines stores as
               position. The already-bylined authors are listed first so the existing
               order is what a save without changes writes back. -->
          <ul class="admin-article__picker">
            {#each [...article.bylines, ...data.availableAuthors.filter((a) => !bylineIds.includes(a.id))] as author (author.id)}
              <li>
                <Checkbox
                  name="author_id"
                  value={String(author.id)}
                  checked={bylineIds.includes(author.id)}
                  label={authorName(author.id)}
                />
              </li>
            {/each}
          </ul>
          <div class="admin-article__actions">
            <Button type="submit" size="sm">{dictionary.localText('action.save')}</Button>
          </div>
        </form>
      </section>

      <!-- ── Filing ──────────────────────────────────────────────────────── -->
      <section class="admin-article__section" aria-label={t('content.admin.filing')}>
        <h2 class="admin-article__section-title">{t('content.admin.filing')}</h2>
        <p class="admin-article__hint">{t('content.admin.filing_hint')}</p>

        <form method="POST" action="?/filing" use:enhance>
          <fieldset class="admin-article__fieldset">
            <legend>{t('content.admin.sections')}</legend>
            <ul class="admin-article__picker">
              {#each data.availableSections as section (section.id)}
                <li>
                  <Checkbox
                    name="section_id"
                    value={String(section.id)}
                    checked={selectedSections.has(section.id)}
                    label={scoped.localText('name', 'section', section.id)}
                  />
                </li>
              {/each}
            </ul>
          </fieldset>

          <fieldset class="admin-article__fieldset">
            <legend>{t('content.admin.topics')}</legend>
            <ul class="admin-article__picker">
              {#each data.availableTopics as topic (topic.id)}
                <li>
                  <Checkbox
                    name="topic_id"
                    value={String(topic.id)}
                    checked={selectedTopics.has(topic.id)}
                    label={scoped.localText('name', 'topic', topic.id)}
                  />
                </li>
              {/each}
            </ul>
          </fieldset>

          <fieldset class="admin-article__fieldset">
            <legend>{t('content.admin.tags')}</legend>
            <ul class="admin-article__picker">
              {#each data.availableTags as tag (tag.id)}
                <li>
                  <Checkbox
                    name="tag_id"
                    value={String(tag.id)}
                    checked={selectedTags.has(tag.id)}
                    label={scoped.localText('name', 'tag', tag.id)}
                  />
                </li>
              {/each}
            </ul>
          </fieldset>

          <div class="admin-article__actions">
            <Button type="submit" size="sm">{dictionary.localText('action.save')}</Button>
          </div>
        </form>
      </section>
    </div>

    <div class="admin-article__side">
      <!-- ── Workflow ────────────────────────────────────────────────────── -->
      <section class="admin-article__section" aria-label={t('content.admin.workflow')}>
        <h2 class="admin-article__section-title">{t('content.admin.checklist')}</h2>

        <ul class="admin-article__checklist">
          {#each data.checklist as item (item.id)}
            <li class="admin-article__checklist-item">
              <!-- One form per item: ticking a box is its own submission, so a half-filled
                   checklist cannot be lost by navigating away. use:enhance keeps the page. -->
              <form
                method="POST"
                action="?/checklist"
                use:enhance
                bind:this={checklistForms[item.id]}
              >
                <input type="hidden" name="item_id" value={item.id} />
                <input type="hidden" name="satisfied" value={item.completed ? 'false' : 'true'} />
                <!-- Checkbox is self-labelling, so it is not wrapped in a Field. -->
                <Checkbox
                  checked={item.completed}
                  label={scoped.localText('label', 'publish_checklist_item', item.id)}
                  onCheckedChange={() => checklistForms[item.id]?.requestSubmit()}
                />
              </form>
              {#if item.required}
                <span class="admin-article__required">{t('content.admin.required')}</span>
              {/if}
            </li>
          {/each}
        </ul>

        <h2 class="admin-article__section-title">{t('content.admin.status')}</h2>

        {#if !publishable}
          <InlineNotification
            severity="info"
            summary={t('content.admin.publish_blocked')}
            detail={blockingItems
              .map((item) => scoped.localText('label', 'publish_checklist_item', item.id))
              .join(', ')}
          />
        {/if}

        <form method="POST" action="?/transition" class="admin-article__form" use:enhance>
          <Select name="status_slug" value={article.status.slug}>
            {#each data.statuses as status (status.id)}
              <SelectItem
                value={status.slug}
                label={scoped.localText('name', 'article_status', status.id)}
              />
            {/each}
          </Select>
          <Button type="submit" variant="primary" size="sm">
            {dictionary.localText('action.save')}
          </Button>
        </form>
      </section>

      <!-- ── Publishing ──────────────────────────────────────────────────── -->
      <section class="admin-article__section" aria-label={t('content.admin.publishing')}>
        <h2 class="admin-article__section-title">{t('content.admin.publishing')}</h2>

        <form method="POST" action="?/publishing" class="admin-article__form-stack" use:enhance>
          <Field label={t('content.admin.slug_label')} id="canonical_slug" required>
            <Input name="canonical_slug" value={article.canonicalSlug} required />
          </Field>

          <Field
            label={t('content.admin.embargo_label')}
            id="embargo_until"
            hint={t('content.admin.embargo_hint')}
          >
            <Input name="embargo_until" type="datetime-local" value={embargoValue} />
          </Field>

          <!-- A hidden false ahead of the checkbox so clearing it submits a value.
               An unchecked checkbox sends nothing, which would read as "unchanged". -->
          <input type="hidden" name="allow_comment" value="false" />
          <Checkbox
            name="allow_comment"
            value="true"
            checked={article.allowComment}
            label={t('content.admin.allow_comment')}
          />

          <div class="admin-article__actions">
            <Button type="submit" size="sm">{dictionary.localText('action.save')}</Button>
          </div>
        </form>
      </section>
    </div>
  </div>
</div>

<style>
  .admin-article {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--space-6, 1.5rem);
    max-width: 78rem;
    margin-inline: auto;
  }

  .admin-article__back {
    font-size: 0.8125rem;
    text-decoration: none;
  }

  .admin-article__title-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .admin-article__title {
    margin: 0;
    font-size: clamp(1.25rem, 3vw, 1.75rem);
    line-height: 1.2;
  }

  .admin-article__slug {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    margin: 0.5rem 0 0;
    font-size: 0.8125rem;
    color: var(--text-soft, inherit);
  }

  .admin-article__slug code {
    overflow-wrap: anywhere;
  }

  .admin-article__public {
    text-decoration: none;
  }

  .admin-article__columns {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  .admin-article__main,
  .admin-article__side {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-width: 0;
  }

  .admin-article__section {
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
  }

  @media (width < 48rem) {
    .admin-article__section {
      padding: 1rem;
    }
  }

  .admin-article__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .admin-article__section-title {
    margin: 0 0 0.75rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .admin-article__subtitle {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .admin-article__locale {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.75rem;
  }

  .admin-article__hint {
    margin: 0 0 0.75rem;
    font-size: 0.8125rem;
    color: var(--text-soft, inherit);
  }

  .admin-article__form-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .admin-article__form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .admin-article__actions {
    display: flex;
    gap: 0.5rem;
  }

  .admin-article__blocks {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 0 0 1.5rem;
    padding: 0;
    list-style: none;
  }

  .admin-article__block {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius);
  }

  .admin-article__block-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-inline-size: 0;
  }

  .admin-article__block-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .admin-article__block-position {
    font-size: 0.75rem;
    color: var(--text-soft, inherit);
  }

  .admin-article__block-actions {
    margin-top: 0.5rem;
  }

  .admin-article__block-move {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .admin-article__add-block {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle, currentColor);
  }

  .admin-article__fieldset {
    border: 0;
    margin: 0 0 1rem;
    padding: 0;
  }

  .admin-article__fieldset legend {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0;
    margin-bottom: 0.5rem;
  }

  .admin-article__picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .admin-article__checklist {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0 0 1.5rem;
    padding: 0;
    list-style: none;
  }

  .admin-article__checklist-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .admin-article__required {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-soft, inherit);
  }

  .admin-article__empty {
    margin: 0 0 1rem;
    color: var(--text-soft, inherit);
  }

  @container (width < 46rem) {
    .admin-article__columns {
      grid-template-columns: 1fr;
    }
  }
</style>

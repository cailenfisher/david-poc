<script lang="ts">
  import { enhance } from '$app/forms'
  import type { SubmitFunction } from '@sveltejs/kit'
  import { getDictionary } from 'diglossia/svelte'
  import { Button, Field, InlineNotification, Input, Textarea } from '@sveltebuilder/coreui'
  import type { DictionaryInstance } from 'diglossia'
  import type { MediaAssetWithRights } from '$lib/types/media-asset'
  import MediaRightsFields from './MediaRightsFields.svelte'

  // A domain component: it edits an asset's own copy, so it resolves alt text, caption and
  // credit itself. The labels around the fields are admin chrome, resolved by the page and
  // passed in as plain strings like every other label on the editor.

  type Labels = {
    altText: string
    altTextHint: string
    caption: string
    credit: string
    rights: string
    rightsMissing: string
    save: string
    license: string
    licenseOptions: Record<string, string>
    creditRequired: string
    sourceUrl: string
    licenseUrl: string
    retrievedAt: string
    expiresAt: string
  }

  let {
    asset,
    storageBaseUrl,
    localeId,
    writingLocale,
    labels,
    dictionary: dictionaryProp,
  }: {
    asset: MediaAssetWithRights
    storageBaseUrl: string
    localeId: number | null
    writingLocale: string
    labels: Labels
    dictionary?: DictionaryInstance
  } = $props()

  // getDictionary() must run during initialization; the override can change after a save, so
  // the choice between them is derived rather than fixed once.
  const contextDictionary = getDictionary()
  const dictionary = $derived(dictionaryProp ?? contextDictionary)

  // Resolved text, for the thumbnail's alt.
  const altText = $derived(dictionary.localText('alt_text', 'media_asset', asset.id))

  // A form field shows this locale's text or nothing. A fallback from another locale presented
  // as this one's would be saved across by the next click on Save.
  const copyFor = (slug: string) =>
    dictionary.localeOf(slug, 'media_asset', asset.id) === writingLocale
      ? dictionary.localText(slug, 'media_asset', asset.id)
      : ''

  const rightsMissing = $derived(asset.rights === null || asset.source === null)

  // Errors appear beside the form that caused them. A failure is shown here and the page's own
  // banner is skipped, which also leaves the typed values in place.
  let copyError = $state('')
  let rightsError = $state('')

  const enhanceInto =
    (setError: (message: string) => void): SubmitFunction =>
    () =>
    async ({ result, update }) => {
      if (result.type === 'failure') {
        setError(String(result.data?.error ?? ''))
        return
      }
      setError('')
      await update({ reset: false })
    }
</script>

<div class="media-asset-editor">
  <img
    class="media-asset-editor__thumbnail"
    src="{storageBaseUrl}/{asset.storageKey}"
    alt={altText}
    width={asset.width ?? undefined}
    height={asset.height ?? undefined}
  />

  {#key writingLocale}
    <form
      method="POST"
      action="?/media_copy"
      class="media-asset-editor__form"
      use:enhance={enhanceInto((message) => (copyError = message))}
    >
      <input type="hidden" name="media_asset_id" value={asset.id} />
      <input type="hidden" name="locale_id" value={localeId} />

      <Field label={labels.altText} id="media-asset-{asset.id}-alt-text" hint={labels.altTextHint} required>
        <Input name="alt_text" value={copyFor('alt_text')} required />
      </Field>
      <Field label={labels.caption} id="media-asset-{asset.id}-caption">
        <Textarea name="caption" rows={2} value={copyFor('caption')} />
      </Field>
      <Field label={labels.credit} id="media-asset-{asset.id}-credit">
        <Input name="credit" value={copyFor('credit')} />
      </Field>

      {#if copyError}
        <InlineNotification severity="error" summary={copyError} />
      {/if}

      <div class="media-asset-editor__actions">
        <Button type="submit" size="sm" variant="secondary">{labels.save}</Button>
      </div>
    </form>
  {/key}

  <!-- Open by default when the record is incomplete: an image with no rights on file is the
       thing the editor most needs to see. -->
  <details class="media-asset-editor__rights" open={rightsMissing}>
    <summary>{labels.rights}</summary>

    {#if rightsMissing}
      <p class="media-asset-editor__missing" role="note">
        <span aria-hidden="true">⚠</span>
        {labels.rightsMissing}
      </p>
    {/if}

    <form
      method="POST"
      action="?/media_rights"
      class="media-asset-editor__form"
      use:enhance={enhanceInto((message) => (rightsError = message))}
    >
      <input type="hidden" name="media_asset_id" value={asset.id} />

      <MediaRightsFields
        idPrefix="media-asset-{asset.id}"
        labels={{
          license: labels.license,
          licenseOptions: labels.licenseOptions,
          creditRequired: labels.creditRequired,
          sourceUrl: labels.sourceUrl,
          licenseUrl: labels.licenseUrl,
          retrievedAt: labels.retrievedAt,
          expiresAt: labels.expiresAt,
        }}
        values={{
          license: asset.rights?.license ?? 'all_rights_reserved',
          creditRequired: asset.rights?.creditRequired ?? false,
          sourceUrl: asset.source?.sourceUrl ?? '',
          licenseUrl: asset.source?.licenseUrl ?? '',
          retrievedAt: asset.source?.retrievedAt.slice(0, 10) ?? '',
          expiresAt: asset.rights?.expiresAt?.slice(0, 10) ?? '',
        }}
      />

      {#if rightsError}
        <InlineNotification severity="error" summary={rightsError} />
      {/if}

      <div class="media-asset-editor__actions">
        <Button type="submit" size="sm" variant="secondary">{labels.save}</Button>
      </div>
    </form>
  </details>
</div>

<style>
  .media-asset-editor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .media-asset-editor__thumbnail {
    max-inline-size: 12rem;
    block-size: auto;
    border-radius: var(--radius);
  }

  .media-asset-editor__form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .media-asset-editor__actions {
    display: flex;
    gap: 0.5rem;
  }

  .media-asset-editor__rights summary {
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-block-end: 0.75rem;
  }

  .media-asset-editor__missing {
    margin: 0 0 0.75rem;
    font-size: 0.8125rem;
    font-weight: 600;
  }
</style>

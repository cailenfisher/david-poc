<script lang="ts">
  import { Checkbox, Field, Input, Select, SelectItem } from '@sveltebuilder/coreui'

  // A UI component, not a domain one: it shows form controls for a rights record and takes
  // every label as a plain string, so it never touches the dictionary. The page that owns the
  // form resolves the labels. Used by the upload form (blank) and the rights edit (prefilled).

  type Labels = {
    license: string
    licenseOptions: Record<string, string>
    creditRequired: string
    sourceUrl: string
    licenseUrl: string
    retrievedAt: string
    expiresAt: string
  }

  type Values = {
    license: string
    creditRequired: boolean
    sourceUrl: string
    licenseUrl: string
    retrievedAt: string
    expiresAt: string
  }

  let {
    idPrefix,
    labels,
    values,
  }: { idPrefix: string; labels: Labels; values: Values } = $props()

  // Initial values only: the fields are the editor's to change from here.
  // svelte-ignore state_referenced_locally
  let license = $state(values.license)
</script>

<div class="media-rights-fields">
  <Field label={labels.license} id="{idPrefix}-license" required>
    <Select name="license" bind:value={license}>
      {#each Object.entries(labels.licenseOptions) as [value, label] (value)}
        <SelectItem {value} {label} />
      {/each}
    </Select>
  </Field>

  <Checkbox
    name="credit_required"
    value="true"
    checked={values.creditRequired}
    label={labels.creditRequired}
  />

  <Field label={labels.sourceUrl} id="{idPrefix}-source-url" required>
    <Input name="source_url" type="url" value={values.sourceUrl} required />
  </Field>

  <Field label={labels.licenseUrl} id="{idPrefix}-license-url" required={license === 'creative_commons'}>
    <Input
      name="license_url"
      type="url"
      value={values.licenseUrl}
      required={license === 'creative_commons'}
    />
  </Field>

  <Field label={labels.retrievedAt} id="{idPrefix}-retrieved-at" required>
    <Input name="retrieved_at" type="date" value={values.retrievedAt} required />
  </Field>

  <Field label={labels.expiresAt} id="{idPrefix}-expires-at">
    <Input name="expires_at" type="date" value={values.expiresAt} />
  </Field>
</div>

<style>
  .media-rights-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
</style>

# Step 4: editor UI

**Why:** an editor has to be able to add an image block, upload a new image or reuse an existing one, and see and fix its alt text, caption, credit and rights in the locale they're writing in.

File: [admin/content/article/[id]/+page.svelte](../../src/routes/(admin)/admin/content/article/[id]/+page.svelte). If the image UI pushes that file well past its current size, move it into `src/lib/components/MediaAssetEditor.svelte`.

## 4.1 Component tier

`MediaAssetEditor` displays and edits an **entity's** copy, so it's a domain component under CLAUDE.md:

- Props: `asset: MediaAssetWithRights`, `storageBaseUrl: string`, `localeId: number`, `writingLocale: string`, and an optional `dictionary?: DictionaryInstance`.
- It resolves alt text, caption and credit itself with `dictionary.localText('alt_text', 'media_asset', asset.id)` and so on, where `const dictionary = dictionaryProp ?? getDictionary()`.
- The page passes its `scoped` instance, as it does for `ArticleView` on the public page.
- Its own labels are `content.admin.*` chrome strings, which the page resolves and passes in as plain strings, or which the component reads under the global scope. Pick whichever the existing editor already does and stay consistent.

Use coreui (`Field`, `Input`, `Textarea`, `Select`/`SelectItem`, `Button`, `InlineNotification`) for every control. Don't hand-roll any.

## 4.2 Block list

- Add `'image'` to `blockTypes` ([line 66](../../src/routes/(admin)/admin/content/article/[id]/+page.svelte#L66)).
- In the `{#each article.blocks}` loop, when `block.blockType === 'image'`:
  - Show a thumbnail. Use a plain `<img>` with the resolved alt text, `width`/`height` from the asset, and max-inline-size around 12rem, not `MediaFigure`. This is admin chrome and shouldn't pull in the public figure styles.
  - Replace the prose `Textarea` with `MediaAssetEditor`:
    - a **copy form** (`?/media_copy`) with alt text (required; hint: "Describe what the image shows for someone who can't see it"), caption, and credit;
    - a **rights form** (`?/media_rights`), collapsed in a `<details>` by default, but **open automatically when rights or source are missing**. Fields: license (`Select` over the five `media_license` values with readable labels), "Credit required" checkbox, source URL, license URL, retrieved-on date, and an optional expiry date.
  - Prefill the copy fields only when `scoped.localeOf(slug, 'media_asset', id) === writingLocale`, using the same pattern as block text, so a fallback-locale string is never shown as if it belonged to this locale.
  - Keep the "Save" button that saves the block for changing the block type and asset; it posts `media_asset_id` as a hidden input.

## 4.3 Adding an image block

In the "Add a block" form, when the chosen type is `image`, swap the textarea for two choices:

1. **Upload new**:
   - a form posting to `?/media_create` with `enctype="multipart/form-data"`;
   - `<input type="file" accept="image/jpeg,image/png,image/webp,image/avif">` with a visible label and a hint stating the 4 MB limit and allowed formats;
   - alt text, caption and credit;
   - the rights fields, **expanded** here because a new upload must state its rights.
   - On success (`form.mediaAssetId`), follow with a `block_save` that creates the image block with that id. Use `use:enhance` with a callback that submits the second action, or have `media_create` accept an `article_id` and create the block itself in the same request. **Prefer the latter.** It's one round trip, and the block can never be lost between two requests. If you choose it, update step 3's action and say so in the commit message.
2. **Use existing**: a `Select` over `data.mediaAssets` (labelled by alt text in the writing locale, falling back to the storage key), which submits `block_save` with that `media_asset_id`.

The block type `Select` toggles which fields are visible. Do this with `$state` bound to the select. If coreui's `Select` doesn't support binding, use its `onchange` and record the gap in `beta-deferred.md`. Hidden fields must not be `required`.

## 4.4 Copy

Add these keys in en and fr to the "Newsroom admin copy" block in `supabase/seeds/zz-newsroom.sql`. Apply only that block locally with `db query --local`; don't re-run the whole seed:

`content.admin.image`, `content.admin.image_upload`, `content.admin.image_existing`, `content.admin.image_file_hint`, `content.admin.alt_text`, `content.admin.alt_text_hint`, `content.admin.caption`, `content.admin.credit`, `content.admin.rights`, `content.admin.license`, `content.admin.license.all_rights_reserved`, `content.admin.license.rights_managed`, `content.admin.license.royalty_free`, `content.admin.license.creative_commons`, `content.admin.license.public_domain`, `content.admin.credit_required`, `content.admin.source_url`, `content.admin.license_url`, `content.admin.retrieved_at`, `content.admin.expires_at`, `content.admin.rights_missing`.

## 4.5 Accessibility

- Every input has a visible `<label>` (via `Field`). The file input's hint is linked with `aria-describedby`.
- `rights_missing` is shown as text and an icon, not color alone.
- `<details>`/`<summary>` for the rights panel. It's keyboard-operable with no extra ARIA.
- Errors from `fail()` appear in `InlineNotification` next to the form that caused them, as with the existing actions.
- Use logical properties in every CSS rule you add (RTL locale).

## Verification

Use `pnpm screenshot` (see `docs/admin-mobile-plan.md`) or a manual browser, at 375px and 1280px:

- [ ] Uploading a 1–2 MB JPEG with alt text, credit and a CC BY license creates the asset, the rights row, the source row and an image block at the end of the body. The thumbnail shows.
- [ ] Uploading a 6 MB file, a `.txt` renamed to `.jpg`, or an image without alt text each shows an inline error. Afterwards, the bucket gains no object (`select count(*) from storage.objects where bucket_id = 'media'` is unchanged).
- [ ] Switching the writing locale to fr shows empty copy fields for an image that only has en copy. Saving fr alt text works.
- [ ] "Use existing" attaches an already-uploaded asset to a second article.
- [ ] Moving and deleting image blocks works. Deleting the block leaves the `media_asset` row.
- [ ] The whole flow can be completed with only the keyboard.
- [ ] `pnpm check` is still at 0 errors and 2 warnings.
- [ ] Commit: `article images: step 4, image blocks in the article editor`.

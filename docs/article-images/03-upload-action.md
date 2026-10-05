# Step 3: upload action

**Why:** the editor needs a server-side path that turns a file and its metadata into a `media_asset`. This step is server-only. The UI comes in step 4.

All changes are in [admin/content/article/[id]/+page.server.ts](../../src/routes/(admin)/admin/content/article/[id]/+page.server.ts), with helpers in `src/lib/server/media-upload.ts`.

## 3.1 Dependency

`pnpm add image-size`. It's pure JavaScript, reads dimensions from the file header without decoding the whole image, and handles JPEG, PNG, WebP and AVIF. `width`/`height` are needed so `MediaFigure` can reserve space and the page doesn't shift as images load (CLS).

## 3.2 `src/lib/server/media-upload.ts`

Export:

- `ALLOWED_IMAGE_MIME_TYPES`: same list as the bucket.
- `MAX_IMAGE_BYTES = 4 * 1024 * 1024`.
- `buildStorageKey(mimeType: string): string` → `media/<yyyy>/<mm>/<crypto.randomUUID()>.<extension>`. The key isn't tied to an article, because assets can be reused. Don't use the original filename, which can leak a path and collide.
- `readImageDimensions(bytes: Uint8Array): { width: number; height: number }` → wraps `image-size` and throws on unreadable input.
- `parseRightsFields(form: FormData)` → reads and validates `license` (must be a `media_license` value), `credit_required`, `expires_at` (optional ISO date), `source_url` (must parse as `http:` or `https:` with `new URL`), `license_url` (required when the license is `creative_commons`) and `retrieved_at` (default: now). It returns either a typed object or a field-keyed error message. Steps 3 and 4 both use it.

Check the MIME type against **both** `file.type` and what `image-size` detects. A renamed `.exe` must fail.

## 3.3 Actions

1. **`media_create`**
   - Read `file` (a `File`), `locale_id`, `alt_text`, `caption`, `credit`, and the rights fields.
   - Validate in this order and return `fail(422, { error })` on the first failure:
     - file present and non-empty;
     - size ≤ `MAX_IMAGE_BYTES`;
     - allowed type;
     - dimensions readable;
     - alt text non-blank;
     - rights fields valid;
     - credit non-blank when credit is required.
   - Upload: `locals.supabase.storage.from('media').upload(pathInsideBucket, bytes, { contentType, upsert: false })`. Note the path passed here **excludes** the `media/` prefix, but `storage_key` **includes** it.
   - Call `create_media_asset` with the full key.
   - **If the RPC fails, delete the uploaded object** (`storage.from('media').remove([pathInsideBucket])`) before returning the error, so a failed save doesn't leave an orphaned file.
   - Map `42501` to 403, as the other actions do.
   - On success, return `{ success: true, mediaAssetId }` so step 4 can attach the new asset to a block without reloading.

2. **`media_copy`**: `media_asset_id`, `locale_id`, `alt_text`, `caption`, `credit` → `set_media_asset_copy`.

3. **`media_rights`**: `media_asset_id` and the rights fields → `set_media_asset_rights`.

4. **`block_save` change:**
   - Read an optional `media_asset_id` and pass it as `p_media_asset_id`, replacing the hard-coded `null` at line 374.
   - For `block_type === 'image'`: require `media_asset_id`, and **don't** require `text`. Image blocks have no prose; their copy is on the asset.
   - For the prose types, keep the existing text requirement.

   Check `upsert_article_block` before relying on it. It always calls `set_entity_copy('text', …)`, and a blank `p_text` just deletes that locale's row, so passing `''` for image blocks is safe.

## 3.4 Loader

Extend the `load` in the same file so the editor can show the article's images and a picker:

- Collect the article's `mediaAssetId`s, and fetch the most recent 24 `media_asset` rows for the picker. Fetch `media_asset_rights` and `media_asset_source` for all of them (the admin can read both).
- Their copy is already loaded via `loadEntityCopy({ scope: 'media_asset', ids })` for the article's own assets ([line 647](../../src/routes/(admin)/admin/content/article/[id]/+page.server.ts#L647) is in `loadArticleForValidation`; add the equivalent to `load`). Include the picker's ids too.
- Add `mediaAssets: MediaAssetWithRights[]` and `storageBaseUrl` to `ArticleEditorView` in [editor-view.ts](../../src/routes/(admin)/admin/content/article/[id]/editor-view.ts), with a comment in the same style as the existing one.

## Verification

- [ ] Running `curl` against `?/media_create` isn't practical (auth cookies), so test through step 4's UI. At this point just confirm that `pnpm check` is at 0 errors and the editor page still loads.
- [ ] Unit-level sanity check: a short script in the scratchpad (not committed) calls `readImageDimensions` on a JPEG and a WebP and gets correct numbers, and calls `buildStorageKey('image/webp')` and gets a key that matches `^media/\d{4}/\d{2}/[0-9a-f-]{36}\.webp$`.
- [ ] Commit: `article images: step 3, upload and media actions`.

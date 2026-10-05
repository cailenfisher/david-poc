# Step 2: media asset data layer (asset, rights, source, copy)

**Why:** `media_asset` has public-read and admin-write RLS (`02-content-rls.sql`), but nothing in the app writes to it. An image is only usable once all of these exist:

- the `media_asset` row: storage key, MIME type, dimensions, uploader;
- a `media_asset_rights` row: license, whether a credit is required, expiry. This table is admin-only under RLS;
- **where the image came from** (see 2.1);
- `alt_text`, `caption` and `credit` copy under the `media_asset` scope.

If only some of these are written, you get an image that renders with `[missing: alt_text]`, or one with no license on record. So the whole set is written atomically by an RPC, the same reasoning as `05-newsroom-admin-rpc.sql`.

## 2.1 Provenance: a new app-owned `media_asset_source` table

`media_asset_rights` records **what** license applies (`media_license` enum: `all_rights_reserved`, `rights_managed`, `royalty_free`, `creative_commons`, `public_domain`). It doesn't record **where the image came from** or **which exact license** applies. `creative_commons` alone can't tell CC BY 4.0 from CC BY-SA 2.0, and correct CC attribution needs both the source and the specific license. `media_asset_rights` is owned by `@sveltebuilder/content`, so we don't add columns to it. Instead, add an app-owned table in [src/lib/server/schema.ts](../../src/lib/server/schema.ts), next to `page_view`:

| column | type | notes |
|---|---|---|
| `id` | `integer` identity PK | integer, not bigint: one row per asset |
| `media_asset_id` | `bigint` not null, **unique**, FK → `media_asset.id` `on delete cascade` | |
| `source_url` | `text` not null | The page the image was obtained from, e.g. the Wikimedia Commons *file page*, not the `upload.wikimedia.org` binary. For the newsroom's own photos, use the internal reference or the photographer's delivery link. |
| `license_url` | `text` null | Canonical URL of the exact license, e.g. `https://creativecommons.org/licenses/by-sa/4.0/`. Null only for `all_rights_reserved` / `rights_managed` work held under a private agreement. |
| `retrieved_at` | `timestamp with time zone` not null | When the license was checked. Licenses on hosting sites can change, so this is evidence of what applied when we took it. |
| `created_at` | `timestamp with time zone` not null default `now()` | |

**What stays out of this table:** the creator's name and any human-readable attribution line. That text appears on the page and is localized (`Photo : …` in French), so it is the `credit` copy under the `media_asset` scope, per CLAUDE.md.

Generate the migration from the schema change:

```
node_modules/.bin/drizzle-kit generate --name media_asset_source --config .sveltebuilder/drizzle.config.ts
```

Check that the generated SQL **only** creates `media_asset_source` and its FK and index. If it tries to change any module-owned table, stop and report.

**RLS:** in `supabase/supplemental/10-media-asset-write.sql` (2.2), enable RLS on `media_asset_source` with one admin-only `for all` policy, matching how `media_asset_rights` is handled in `02-content-rls.sql`. No public read.

## 2.2 RPCs: `supabase/supplemental/10-media-asset-write.sql`

All functions are `security invoker` with `set search_path = ''`, so the table policies still check every statement. Build the copy writes on the existing `public.set_entity_copy(slug, scope, entity_id, locale_id, content)`.

1. **`create_media_asset(...) returns bigint`**
   - Parameters: `p_storage_key text, p_mime_type text, p_width integer, p_height integer, p_license text, p_credit_required boolean, p_expires_at timestamptz, p_source_url text, p_license_url text, p_retrieved_at timestamptz, p_locale_id bigint, p_alt_text text, p_caption text, p_credit text`.
   - Validate first and `raise exception` with a clear message when any of these fail:
     - `p_storage_key` starts with `media/`;
     - `p_source_url` is non-blank and starts with `http`;
     - `p_alt_text` is non-blank;
     - `p_credit` is non-blank when `p_credit_required` is true;
     - `p_license_url` is non-blank when `p_license` is `creative_commons`. Different CC licenses have different terms, so the exact one has to be on record.
   - Insert `media_asset` with `media_type = 'image'` and `uploaded_by = public.current_user_id()`. Raise if that is null.
   - Insert `media_asset_rights` and `media_asset_source`.
   - Call `set_entity_copy` for `alt_text`, `caption` and `credit` (scope `media_asset`). An empty caption is fine, because `set_entity_copy` deletes a blank locale row.
   - Return the new id.

2. **`set_media_asset_copy(p_media_asset_id bigint, p_locale_id bigint, p_alt_text text, p_caption text, p_credit text) returns void`**: three `set_entity_copy` calls. The editor uses this to add a second locale's alt text or to fix a caption. It refuses a blank alt text, because clearing alt text would make a published article invalid in that locale.

3. **`set_media_asset_rights(p_media_asset_id bigint, p_license text, p_credit_required boolean, p_expires_at timestamptz, p_source_url text, p_license_url text, p_retrieved_at timestamptz) returns void`**: updates both `media_asset_rights` and `media_asset_source`, inserting either row if it's missing. Same validation as in 1.

Don't add a delete RPC. Deleting assets is deferred (see `beta-deferred.md`). `delete_article_block` already leaves the asset alone, which is correct because an asset can be reused.

Generate a custom migration `media_asset_write` containing `-- supplemental: 10-media-asset-write.sql` and the file's contents (see the README ground rules).

## 2.3 Types

- Add `MediaAssetSource` to `src/lib/types/` (camelCase fields).
- `MediaAsset`, `MediaAssetRights` and `MediaAssetWithCopy` come from `@sveltebuilder/content`; import them, don't redeclare them.
- If the editor needs an asset with its rights and source, define `MediaAssetWithRights = MediaAsset & { rights: MediaAssetRights | null; source: MediaAssetSource | null }` in the same types file.

## Verification

- [ ] Both migrations applied locally (`migration up --local`); `\d public.media_asset_source` shows the unique FK.
- [ ] As the local admin, through `db query --local` with `set local role authenticated` and `request.jwt.claims` set (or simply from step 3's action later), `create_media_asset` with valid arguments returns an id. Afterwards there is one row in each of `media_asset`, `media_asset_rights` and `media_asset_source`, and three `local_text_link` rows (`alt_text`, `caption`, `credit`) with scope `media_asset`.
- [ ] Each of these raises, and leaves **no** partial rows: blank alt text; `creative_commons` with no `license_url`; `credit_required` with a blank credit; a storage key without the `media/` prefix.
- [ ] As `anon`, `select * from media_asset_source` returns 0 rows, and `select * from media_asset` still works.
- [ ] `pnpm check` is still at 0 errors and 2 warnings.
- [ ] Commit: `article images: step 2, media asset source table and write RPCs`.

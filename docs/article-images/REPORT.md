# Article images: verification report

Verified 2026-10-05 against the local stack (dev server on `localhost:5173`, local Supabase). The hosted rollout was run by the operator and was not verified from here.

## What was built

| Step | Result |
|---|---|
| 1 | Public `media` bucket (4 MiB, jpeg/png/webp/avif) and four `storage.objects` policies, as migration `0003_media_storage.sql`. |
| 2 | App-owned `media_asset_source` table, plus `create_media_asset`, `set_media_asset_copy` and `set_media_asset_rights` RPCs that write an asset, its rights, its source and its alt text / caption / credit atomically (migrations `0004`, `0005`). |
| 3 | Upload action (`media_create`) with size, MIME and byte-sniffing checks, dimension reading and orphan cleanup; `media_copy`, `media_rights`; `block_save` takes an asset. |
| 4 | Image blocks in the article editor: upload (which also creates the block), use existing, edit alt/caption/credit per locale, rights panel that opens when rights are missing. `MediaAssetEditor` (domain component) and `MediaRightsFields` (UI component). |
| 5 | Publish gate `validateImageRights`: no asset, no rights, no source, CC without license URL, expired, missing credit, CC marked as not needing credit. `images_credited` relabelled. |
| 6 | Five sourced, credited, illustrative images seeded on five articles, with `media-sources.md` as the audit record. |
| 7 | This verification, and the fixes below. |

## Checklist results

### 7.1 Public article page

Four articles (two first-image, one with the image moved mid-body, one with no image) × en/fr × 375/768/1280px, scripted in a real browser.

| Check | Result |
|---|---|
| Image in `<figure>` with `<figcaption>` showing caption and credit in the page's locale | Pass |
| `alt` non-empty in the page's locale, `width`/`height` present | Pass |
| `loading="lazy"` | **Not as written.** The lead image is `loading="eager"`. `ArticleView` hoists the first image into a hero and loads it eagerly, which is the right choice for the largest image on the page. Lazy applies to later images. Not a defect. |
| No layout shift while loading | Pass. CLS 0 with the cache off and the network throttled (300 ms latency, 200 KB/s). |
| No horizontal overflow at 375px | **Failed at first, fixed.** See "Fixed during this step". Passes after. |
| `og:image` absolute URL returning 200, `og:image:alt`, `twitter:card = summary_large_image` | Pass after the fix. `og:image:alt` was empty before. The mid-body article also gets `og:image`. |
| JSON-LD `NewsArticle.image` has the same URL | Pass (string-equal to `og:image` in every case). |
| Paste JSON-LD into validator.schema.org | **Not done.** I can't submit to an external validator from this environment. Only the structure was checked. Do this once on the hosted site. |
| No images: no `og:image`, `twitter:card = summary` | Pass |

### 7.2 Arabic (RTL)

Pass. With `ar`, `<html lang="ar">` and the figure's direction is `rtl`. There is no horizontal overflow, and the credit wraps under the caption with no overlap. Alt text, caption and credit fall back to English, as expected because no Arabic media copy is seeded.

### 7.3 Editor round trip

Driven through the real form actions over HTTP with an admin session, not by clicking. The UI itself was exercised in step 4.

| Check | Result |
|---|---|
| New draft, CC BY 4.0 upload with en copy, publish in en | Pass |
| Publish in fr fails, then passes once fr copy is added | Pass after a fix. It first failed on the credit only: the module's alt check accepts the English fallback, so a missing French alt text slipped through. `validateImageRights` now also requires alt text in the publishing locale. With fr alt and credit removed it reports both. |
| Public page shows the image in both locales | Pass |
| Reuse the asset on a second article | Pass |

The test article, asset, copy and storage object were deleted afterwards.

### 7.4 Security

| Check | Result |
|---|---|
| anon `media_asset_rights` and `media_asset_source` return `[]` | Pass (`media_asset` itself is readable, as intended) |
| anon POST to `storage/v1/object/media/…` rejected | Pass (body `statusCode: "403"`, row-level security) |
| Non-admin account (`reporter@example.com`) cannot use `?/media_create` | Pass (failure 403, "Not allowed to upload images") |
| Non-admin has no bucket write | Pass (storage POST rejected) |
| Also checked | Non-admin gets `[]` from the rights table and 42501 from `create_media_asset`. No object was uploaded by any of these. |

### 7.5 Checks

| Check | Result |
|---|---|
| `pnpm check` | 0 errors, the same 2 warnings |
| `pnpm build` | Succeeds (exit 0, `adapter-auto`) |
| `git status` clean apart from intended changes | Pass |
| Only the 5 images in `supabase/seeds/media/` | Pass, with one deviation: the audit table is `supabase/seeds/media-sources.md`, not `media/SOURCES.md`, because `supabase seed buckets` uploads everything in that folder and rejects Markdown. |

## Fixed during this step

1. **Horizontal overflow on phones, on every public page.** Three causes:
   - the root `.app` grid used an implicit auto column, which grows to its widest content (`grid-template-columns: minmax(0, 1fr)`);
   - the header could not wrap, so the locale switcher pushed it past 375px (`flex-wrap`);
   - `MediaFigure` forbids its credit from wrapping (overridden in `ArticleViewUniqueHero`).
2. **`<html lang>` was the literal text `%sveltekit.lang%` on every page.** `hooks.server.ts` now fills it from the resolved locale. This is older than the image work.
3. **Empty `og:image:alt` and `twitter:image:alt`.** The module reads alt text off the asset, which carries none. The article page now resolves it from the dictionary.
4. **Fallback-locale alt text passing the publish gate.** See 7.3.

## Findings not fixed

All of these are module issues, recorded in `beta-deferred.md` under "Module changes" with the workaround in place:

- `ArticleView` renders the lead image twice (worked around by hiding the body copy). The first image is also always lifted to the top, so an editor cannot place it mid-body.
- `buildArticleMetaTags` emits empty alt tags.
- `MediaFigure` credit cannot wrap.
- `validateArticleForPublish` accepts fallback-locale alt text, and skips an image block with no asset.
- Already listed: cards have no images, the credit has no license link, and rights/source belong in the module schema.

Also:

- **validator.schema.org was not run** (see 7.1).
- **Hosted was not verified by me.** The operator ran the rollout; spot-check one hosted article and the hosted bucket.
- **Test-induced churn:** moving an image block up and down renumbered that article's block positions (order restored, values changed). Harmless.

## Hosted rollout commands (step 6.5, already run by the operator)

1. `npx supabase@2.119.0 db push`
2. `npx supabase@2.119.0 storage cp -r supabase/seeds/media/2026 ss:///media/2026 --linked --experimental`
3. `npx supabase@2.119.0 db query --linked --file supabase/seeds/zzz-media.sql`

This step changed code only (no migrations, no seed changes), so nothing further is needed on hosted beyond deploying the app.

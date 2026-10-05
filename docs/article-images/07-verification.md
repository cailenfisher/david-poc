# Step 7: end-to-end verification

**Why:** steps 1–6 each check their own part. This step checks the whole feature as a reader and an editor would use it, before the POC is called done. It's mostly observation. Fix only small defects here. Anything bigger goes into the report as a finding.

## 7.1 Public article page

Use two seeded articles with images, plus one article where you've moved the image mid-body with the editor's ↑/↓ buttons. Check each at 375px, 768px and 1280px, in **en** and **fr**:

- [ ] The image renders inside `<figure>` with a `<figcaption>` showing the caption and the credit in the page's locale.
- [ ] `<img>` has non-empty `alt` in the page's locale, `width`/`height` attributes, and `loading="lazy"`.
- [ ] Layout doesn't shift while the image loads. Throttle the network in devtools to check.
- [ ] No horizontal overflow at 375px.
- [ ] `<head>` contains `og:image` with an absolute URL that returns 200, `og:image:alt`, and `twitter:card = summary_large_image` for the article whose image is first. Check the article with the mid-body image too. The module takes the *first image block* wherever it is, so that article should also have `og:image`.
- [ ] The JSON-LD `NewsArticle.image` array contains the same URL. Paste the JSON-LD into https://validator.schema.org (it's public data) and confirm there are no errors on `image`.
- [ ] An article **without** images still has no `og:image` and uses `twitter:card = summary`.

## 7.2 Arabic (RTL)

- [ ] With the locale set to `ar`, the figure caption and credit flow right to left without overlap. Alt text falls back to the default locale, which is acceptable for the POC because no Arabic copy is seeded. Note it in the report.

## 7.3 Editor round trip

As the local admin:

- [ ] Create a new draft. Upload an image with CC BY 4.0 rights, en alt text, caption and credit. Fill the remaining publish requirements, tick the checklist, and publish in en. It succeeds.
- [ ] Switch to fr and try to publish (or validate) in fr. It fails on alt text and credit. Add them, and it succeeds.
- [ ] The public page shows the new image in both locales.
- [ ] Reuse that asset on a second article via "Use existing".

## 7.4 Security

- [ ] Signed out (anon): `select * from media_asset_rights` and `select * from media_asset_source` through PostgREST (`curl` with the anon key) return `[]`.
- [ ] Signed out: a `POST` to `storage/v1/object/media/test.webp` with the anon key is rejected.
- [ ] A signed-in **non-admin** account can't use `?/media_create` (403), and has no write access to the bucket. If no non-admin account exists locally, record this as untested rather than creating one with `db reset`.

## 7.5 Checks

- [ ] `pnpm check` is still at 0 errors and 2 warnings.
- [ ] `pnpm build` succeeds.
- [ ] `git status` is clean apart from intended changes. No stray files in `supabase/seeds/media/` beyond the 5 images and `SOURCES.md`.

## 7.6 Report

Write `docs/article-images/REPORT.md`:

- what was built;
- every checkbox above, with its result;
- anything fixed during this step;
- findings that weren't fixed;
- the hosted rollout commands from step 6.5, for the operator.

Add any new deferral to `beta-deferred.md`.

Commit: `article images: step 7, verification report`.

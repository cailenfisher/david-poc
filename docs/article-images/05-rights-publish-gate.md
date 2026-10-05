# Step 5: rights publish gate

**Why:** we publish only images we have the right to use, credited the way their license requires, from the POC onward. The seeded `images_credited` checklist item (`required = true`) is a box an editor ticks by hand. Nothing checks that it's true. This step makes the system enforce it.

`validateArticleForPublish` comes from `@sveltebuilder/content` and only checks alt text. **Don't modify the module.** Add an app-side check that runs after it, in the same `transition` action ([+page.server.ts:232](../../src/routes/(admin)/admin/content/article/[id]/+page.server.ts#L232)).

## 5.1 `src/lib/server/validate-image-rights.ts`

`validateImageRights(blocks, assets, dictionary, now = new Date()): string[]` returns a list of human-readable problems, empty when the article is fine. For every block with `blockType === 'image'`, report:

1. **No asset attached:** `mediaAssetId` is null. The module validator skips these silently; publishing an image block with nothing in it is a bug.
2. **No rights row:** the license is unknown, so the image can't be published.
3. **No source row, or a blank `source_url`:** we can't show where the image came from.
4. **`creative_commons` with no `license_url`.**
5. **Expired:** `expires_at` is not null and earlier than `now`.
6. **Missing credit:** `credit_required` is true and the `credit` copy is blank or `[missing:` **in the locale being published**. Resolve it through the dictionary passed in, exactly as the module validator does for alt text.
7. **Licenses that always need a credit:** `creative_commons` with `credit_required = false`. Every CC license except CC0 requires attribution, and CC0 is recorded as `public_domain`. Report it as an inconsistent rights record so the editor fixes the data rather than publishing without credit.

Each message names the block's position, e.g. `Image block 3: license expired on 2026-09-30.`, to match the module's wording style.

## 5.2 Wire into `transition`

- `loadArticleForValidation` ([line 552](../../src/routes/(admin)/admin/content/article/[id]/+page.server.ts#L552)) already loads blocks and `media_asset` copy. Extend it to load `media_asset_rights` and `media_asset_source` for the article's asset ids.
- In the `statusSlug === 'published'` branch, run `validateImageRights` after `validateArticleForPublish`. If it returns problems, `fail(422, { error: problems.join(' ') })`. If the module validator already threw, merge both lists so the editor sees every problem at once instead of fixing one only to hit the next.

## 5.3 `images_credited` checklist item

Leave it as a manual, required item. It now means "a human has looked at the credits as they appear", and the gate guarantees the data behind them. **Don't auto-tick it.**

Change its label to "Image credits checked on the preview" (en) and "Crédits photo vérifiés sur l'aperçu" (fr). The label is `local_text` under slug `label`, scope `publish_checklist_item`, keyed by the item's id. `content.sql` seeds it with `on conflict (link, locale) do nothing`, so don't edit that file. Add an override to `zz-newsroom.sql` that joins the same way but uses `on conflict (link, locale) do update set content = excluded.content`. Apply only that statement locally. An article with no images can tick the item trivially. Record "auto-satisfy when the article has no images" in `beta-deferred.md`.

## 5.4 Show rights on the public page?

**No change.** `MediaFigure` already renders the `credit` copy under each image. For CC images, the credit copy itself carries the license name (step 6 defines the format), so readers see it. Linking the license name to `license_url` would need a `MediaFigure` change in the module. It's listed in `beta-deferred.md`.

## Verification

Use an article with one image block and every other publish requirement met:

- [ ] Delete the image's rights row via `db query --local`; publishing fails with the "no rights" message. Restore it.
- [ ] Set `expires_at` to yesterday; publishing fails with the expiry message.
- [ ] Set `license = 'creative_commons'` and `license_url = null`; publishing fails.
- [ ] Set `credit_required = true` with fr credit missing. Publishing in **fr** fails, and publishing in **en** succeeds.
- [ ] Set `creative_commons` with `credit_required = false`; publishing fails with the inconsistency message.
- [ ] With all rights correct, publishing succeeds.
- [ ] An image block with no asset blocks publishing.
- [ ] `pnpm check` is still at 0 errors and 2 warnings.
- [ ] Commit: `article images: step 5, rights gate on publish`.

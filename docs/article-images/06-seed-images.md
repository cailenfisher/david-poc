# Step 6: seed images, sourced and credited correctly

**Why:** the demo newsroom (The Meridian, `zz-newsroom.sql`) needs images, and we are treating them the way a real newsroom would. Every seeded image is legally reusable, its license and source are recorded, and its credit line meets the license's attribution terms.

## 6.1 Sourcing rules

1. **Acceptable sources, in order of preference:**
   - **Public domain works of the US federal government**, e.g. NASA, NOAA, the Library of Congress where marked "No known restrictions", or US military photos marked public domain. Record these as `public_domain`. Set `credit_required = true` anyway: it's good practice, and it's free.
   - **Wikimedia Commons files under CC0, CC BY or CC BY-SA.** CC0 is `public_domain`; the others are `creative_commons` with the exact `license_url`.
   - **Don't use** Unsplash, Pexels or similar "free" stock. Their custom licenses forbid some uses and don't give a machine-readable license URL, so the rights record would be weaker than the rule above. **Don't use** anything marked "non-commercial" (NC) or "no derivatives" (ND). NC conflicts with a commercial product, and resizing may count as a derivative.
2. **Check the license on the file's own page**, not on a search result or an aggregator. `source_url` is that file page. `retrieved_at` is the day you checked it.
3. **The fictional articles must not be misrepresented.** These are made-up news stories. **Never** use a photo of a real identifiable person, a real victim, or a real event as if it depicted the fictional story. Choose generic, illustrative subjects: a city skyline, a transit bus, a central bank building's exterior, a server room, a hospital corridor, a port crane. Each caption must make clear that the photo is illustrative, e.g. "A bus at a downtown stop. (File photo)", and must not state anything the image doesn't show.
4. **Credit format** (the `credit` copy):
   - **en:** `Photo: <Creator> / <Source>, <License short name>`, e.g. `Photo: Jane Doe / Wikimedia Commons, CC BY-SA 4.0` or `Photo: NASA, public domain`.
   - **fr:** `Photo : <Creator> / <Source>, <License short name>`, with the French space before the colon. License short names aren't translated; "public domain" becomes `domaine public`.
   - If the image was resized or cropped, which is always true here because of 6.2, CC BY-SA and CC BY require indicating changes. Append `, resized` / `, redimensionnée`. If you crop, use `, cropped` / `, recadrée`.
5. **Alt text** describes what is visibly in the image, in en and fr, written by you rather than copied from the source page's title.

## 6.2 Files

- Pick **5 images** for 5 different published articles in `zz-newsroom.sql` (choose articles whose subject has a plausible generic illustration).
- Resize each to at most **1600px wide** and encode it as WebP at quality ~80, aiming for **under 300 KB**. These files are committed to git. Use `sharp` from a scratchpad script or `cwebp`, whichever is available, and don't add either to `package.json`.
- Store them at `supabase/seeds/media/2026/10/<descriptive-kebab-name>.webp`. These are seed paths, so readable names are fine, unlike step 3's UUIDs.
- Add `supabase/seeds/media/SOURCES.md`: a table with file, source URL, creator, license, license URL, retrieved date, and changes made. It's the human-readable record behind the SQL, for anyone who audits the repo.

## 6.3 Local bucket seeding

In `supabase/config.toml`, add:

```toml
[storage.buckets.media]
public = true
file_size_limit = "4MiB"
allowed_mime_types = ["image/jpeg", "image/png", "image/webp", "image/avif"]
objects_path = "./seeds/media"
```

The values must match step 1's migration, so the local config and the migration don't disagree. Upload locally with `npx supabase@2.119.0 seed buckets --local`. The objects land at `media/2026/10/<name>.webp`. Check that against `storage_key` in 6.4.

## 6.4 SQL seed: `supabase/seeds/zzz-media.sql`

It must sort **after** `zz-newsroom.sql`, because it references articles. `zz-newsroom-media.sql` would sort *before* it (`-` < `.`). After the operator next runs `sync:supabase`, check its position in the generated `seed.sql`.

For each image:

1. `insert into media_asset (media_type, storage_key, width, height, mime_type, uploaded_by)`. Use real pixel dimensions, and a `storage_key` of `media/2026/10/<name>.webp`.
   - **`uploaded_by` is not null, and a freshly reset DB has no `user_account`.** Use the same `join user_account u on u.id = (select min(id) from public.user_account)` pattern as the "Desk assignments" block in `zz-newsroom.sql` (around line 812), and copy its explanatory comment. The insert is skipped before the first sign-in, and re-running the seed fills it in.
   - Make it idempotent with `on conflict (storage_key) do nothing`.
2. `media_asset_rights` and `media_asset_source` rows, guarded with `where not exists`, keyed by `storage_key`.
3. `local_text_link` + `local_text` for `alt_text`, `caption` and `credit` in **en and fr**, using the existing `(values …) join` pattern from `zz-newsroom.sql`.
4. An `article_block` of type `image` on the chosen article, **before its first paragraph**: use `position = (select min(position) from article_block where article_id = a.id) - 1`.
   - `position` is an integer with no unique constraint, and only ordering matters, so a value below the current minimum puts the image first without renumbering the existing blocks.
   - Being first also makes it the `og:image`.
   - Guard with `where not exists` on `(article_id, media_asset_id)`.

Apply locally: `npx supabase@2.119.0 db query --local --file supabase/seeds/zzz-media.sql`.

## 6.5 Hosted rollout (operator runs these; the executing session must not)

List these commands in the commit body and in the final report. **Don't run them:**

1. `npx supabase@2.119.0 db push`, which applies migrations 0003 onward (bucket, `media_asset_source`, RPCs).
2. Upload the five objects to the hosted bucket. The current CLI form is `npx supabase@2.119.0 storage cp -r supabase/seeds/media/2026 ss:///media/2026 --linked --experimental`. Check `--help` first, since the storage subcommand is experimental.
3. `npx supabase@2.119.0 db query --linked --file supabase/seeds/zzz-media.sql`. Apply only this file, **never** the whole `seed.sql` (see the project memory note).

## Verification

- [ ] `SOURCES.md` has a complete row for each of the 5 images, and each `source_url` opens to a page showing the license recorded.
- [ ] None of the images is NC, ND, or from a custom-license stock site. None shows an identifiable real person in a news context.
- [ ] After seeding locally: 5 `media_asset` rows, 5 rights rows, 5 source rows, and 30 `local_text` rows (5 × 3 slugs × 2 locales).
- [ ] Each image URL `http://127.0.0.1:54321/storage/v1/object/public/<storage_key>` returns 200 with `content-type: image/webp`.
- [ ] Re-running `zzz-media.sql` inserts nothing new.
- [ ] Each of the 5 articles passes step 5's gate in en and in fr. Test by moving one back to draft and re-publishing.
- [ ] Commit: `article images: step 6, seed sourced and credited images`. Include the hosted rollout list in the body.

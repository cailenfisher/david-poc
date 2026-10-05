# Article images: deliberately left for beta

These are out of scope for the POC on purpose. If a step needs one of these, record it here with the context and move on. Don't build it.

Rights tracking is **not** on this list. It's in scope from the POC onward (steps 2, 5 and 6).

## Module changes (`@sveltebuilder/content`)

These need a change in the module, not in this app. Don't patch `node_modules`.

- **Images on cards.** `ArticleCard` has no image prop, so the homepage, section fronts, topic pages and author pages show text only. Needs a `leadMediaAsset` (or a `mediaAssets` map plus lead-block lookup) prop and a `MediaFigure` slot per variant (`lead` large, `secondary` small, `river`/`brief` none or thumbnail). `zz-newsroom.sql` already notes that the author page passes a `mediaAssets` prop `ArticleCard` doesn't declare.
- **License link in the credit.** `MediaFigure` renders `credit` as plain text. For CC images, the license name should link to `license_url`, which needs the source and rights data passed into the component.
- **Gallery and video blocks.** `ArticleBlockRenderer` already renders `gallery` and `video` blocks via `MediaFigure`. The editor (step 4) only offers `image`. Galleries need an ordered asset list in the block's `content` jsonb and a multi-select picker; video needs `media_type = 'video'`, bucket MIME types and a poster frame.
- **Lead-image choice.** The `og:image` and JSON-LD image are the *first image block*. Choosing a lead image explicitly, or adding a social-only crop, needs a module field.
- **Alt text validated in every published locale at once.** `validateArticleForPublish` checks the single locale being published. Publishing per locale is the POC's model; a "publish everywhere" flow would need this.

## Delivery and performance

- **Responsive images.** No `srcset`/`sizes`; one 1600px file for every viewport. Supabase image transformations (`/render/image/public/…?width=`) need a paid plan on hosted, and `MediaFigure` would need a `srcset` builder. Alternative: generate 2–3 widths at upload time.
- **Modern-format conversion at upload.** The file is stored as uploaded. Converting to WebP/AVIF and stripping EXIF happens neither on upload nor anywhere else. **Stripping EXIF matters before beta**, because phone photos carry GPS coordinates. This would be the first beta item for media.
- **Direct-to-storage uploads.** Uploads go through a SvelteKit form action, which is capped at ~4.5 MB by Vercel's request body limit, so the bucket allows 4 MiB. Signed upload URLs (`createSignedUploadUrl` + `uploadToSignedUrl`) would lift the cap and save a server hop, at the cost of client-side JS and a two-phase create.
- **CDN caching headers.** Storage objects are served with Supabase defaults. Set `cacheControl` on upload and confirm CDN behavior on hosted.

## Media library and lifecycle

- **A media library screen** (`/admin/media-asset`): browse, search by alt text, edit copy and rights outside an article, and see where each asset is used. The POC's editor picker lists the latest 24 assets only.
- **Deleting assets and cleaning up orphans.** There's no delete RPC. Deleting a block leaves the asset, by design. Beta needs "delete if unused" (remove the storage object, rows and `media_asset`-scoped copy, which has no FK cascade because `local_text_link.entity_id` is polymorphic) and a periodic orphan sweep.
- **Replacing an image's file** while keeping its id, copy and placements.
- **Expired-license handling after publish.** Step 5 blocks *publishing* with an expired license. An already-published article whose image license expires later keeps showing it. Beta: a scheduled job, or a render-time check, that hides or flags expired images and alerts the desk.
- **Rights reporting.** A dashboard widget listing assets with missing or expiring rights.

## Editorial workflow

- **Auto-satisfy `images_credited`** when an article has no image blocks, so editors aren't asked to tick a box that doesn't apply. Step 5 relabels the item "Image credits checked on the preview" but leaves it a manual, required tick.
- **Focal point and cropping** in the editor, stored in the block's `content` jsonb.
- **Drag-and-drop and paste-to-upload** in the editor.
- **Arabic and other locales' media copy.** Seeds cover en and fr only.

## coreui gaps found during the image work

- **`Select` shows the item's value in its trigger, not its label.** The license picker in the image forms shows `all_rights_reserved` once chosen, though the list shows "All rights reserved". The block-type pickers already behave this way. Fix in coreui so the trigger renders the selected item's label.
- **`ArticleView` renders the lead image twice.** It lifts the first image block into a hero and then renders the same block in the body too. `ArticleViewUniqueHero.svelte` hides the body copy with CSS as a workaround; fix it in `@sveltebuilder/content` (skip the hero block in the body, or take a prop to), then delete the wrapper.

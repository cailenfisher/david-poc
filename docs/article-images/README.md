# Article images: implementation plan

**Goal:** editors can add licensed, properly credited images to articles in the admin, and those images render on the public article page. This is the last feature before the POC is called done.

**Most of the read side already works.** Don't rebuild it:

- **Schema:** `media_asset`, `media_asset_rights`, `article_block.media_asset_id`, and `image` in `article_block_type` all come from `@sveltebuilder/content`.
- **Block RPC:** `upsert_article_block` ([05-newsroom-admin-rpc.sql](../../supabase/supplemental/05-newsroom-admin-rpc.sql)) already takes `p_media_asset_id`.
- **Public page:** [article/[slug]/+page.server.ts](../../src/routes/(content)/article/[slug]/+page.server.ts) loads the referenced assets and their `media_asset`-scoped copy. `ArticleView` → `ArticleBlockRenderer` → `MediaFigure` render `<figure>`, `<img>`, alt text, caption and credit.
- **SEO:** `buildArticleMetaTags` / `buildNewsArticleJsonLd` emit `og:image` and the JSON-LD `image` from the first image block.
- **Publish check:** `validateArticleForPublish` already rejects an image block whose asset has no `alt_text` in the publishing locale.

**What's missing:** a storage bucket, a write path for `media_asset` and its rights and source, an upload action, editor UI, a rights gate on publish, and seed images.

## Steps

Run these in order. Each file ends with a **Verification** block, and every check in it must pass before you start the next step.

| # | File | Summary |
|---|---|---|
| 1 | [01-storage-bucket.md](01-storage-bucket.md) | Public `media` bucket and `storage.objects` policies, as a migration |
| 2 | [02-media-asset-data-layer.md](02-media-asset-data-layer.md) | `media_asset_source` table, and RPCs that write an asset with its rights, source and copy in one transaction |
| 3 | [03-upload-action.md](03-upload-action.md) | Form action: validate the file, read its dimensions, upload it, call the RPC |
| 4 | [04-editor-ui.md](04-editor-ui.md) | `image` block type in the article editor: upload, pick an existing asset, edit alt/caption/credit and rights |
| 5 | [05-rights-publish-gate.md](05-rights-publish-gate.md) | Block publishing when an image has no rights, no source, has expired, or needs a credit it lacks |
| 6 | [06-seed-images.md](06-seed-images.md) | Real, legally reusable images, sourced and credited correctly, seeded locally and on hosted |
| 7 | [07-verification.md](07-verification.md) | End-to-end check in both locales and at mobile width |

Work deliberately left for beta is listed in [beta-deferred.md](beta-deferred.md). If a step starts to need something from that list, stop and record it there rather than building it.

---

## Ground rules (all steps)

1. **Read `CLAUDE.md` first.** It is binding, especially: no copy fields on domain tables (alt text, caption and credit are `local_text` under the `media_asset` scope), no `is`/`has` boolean prefixes, no abbreviations, and BEM `kebab-case` CSS classes.
2. **Work on the `article-images` branch.** Commit at the end of each step with the message `article images: step N, <short summary>`. **Never push.**
3. **`pnpm check` must stay at 0 errors.** The baseline is **0 errors, 2 warnings**: `src/routes/+layout.svelte` 21:34 `state_referenced_locally`, and `admin/local-text/+page.svelte` 195:3, an unused `.local-text-admin__content-cell` selector. Leave both alone, and add no new warnings.
4. **Never edit `node_modules/`**, including `@sveltebuilder/content` and `@sveltebuilder/coreui`. If a module component is missing something, record it in `beta-deferred.md`.
5. **Migrations** (from the project memory note on `sync:supabase`):
   - Every new SQL file gets its **own** custom migration. Generate it with
     `node_modules/.bin/drizzle-kit generate --custom --name <name> --config .sveltebuilder/drizzle.config.ts`
     (or a plain `drizzle-kit generate --name <name> ...` when `src/lib/server/schema.ts` changed).
   - Put `-- supplemental: <file>.sql` plus that file's full contents into the migration, so `sync:supabase` recognises it as applied and doesn't append it to `0002_dashboard.sql`, which hosted has already applied.
   - Follow `supabase/migrations/0002_dashboard.sql` as the pattern.
6. **Database safety:**
   - Never run `pnpm db:reset` or `supabase db reset`, because it wipes the operator's local admin account.
   - Apply new SQL locally with `npx supabase@2.119.0 db query --local --file <file>`, or `npx supabase@2.119.0 migration up --local`.
   - **Never run anything with `--linked`.** Hosted rollout is a separate list at the end of step 6, for the operator to run.
7. **SQL style:** match the existing supplemental files. That means `security invoker` unless there's a documented reason not to, `set search_path = ''` with every reference schema-qualified, and admin gating through `public.current_user_admin()` and `public.current_user_id()`, never `auth.uid()` directly.
8. **Admin chrome copy** (labels and hints the editor sees) is seeded as global `content.admin.*` keys in **en and fr**, following the "Newsroom admin copy" block in `supabase/seeds/zz-newsroom.sql`.
9. **The dev server is already running** at `http://localhost:5173` against local Supabase. Don't start another.
10. **If a permission prompt or classifier denies a tool call, stop and report what you were trying to do.** Don't look for a workaround.

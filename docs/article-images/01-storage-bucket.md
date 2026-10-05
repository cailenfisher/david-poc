# Step 1: storage bucket

**Why:** nothing creates a bucket today. `[storage] enabled = true` in `supabase/config.toml` only starts the service. The public article page builds image URLs as

```
${PUBLIC_SUPABASE_URL}/storage/v1/object/public/<media_asset.storage_key>
```

([article/[slug]/+page.server.ts:21](../../src/routes/(content)/article/[slug]/+page.server.ts#L21)). So **`storage_key` must start with the bucket name**, e.g. `media/2026/10/<uuid>.webp`. Steps 3 and 6 rely on this.

The bucket has to come from a migration, not from `config.toml` alone. `[storage.buckets.*]` in `config.toml` only affects the local stack, and hosted would never get the bucket.

## 1.1 Supplemental file

Create `supabase/supplemental/09-media-storage.sql`. Its header comment should explain the URL contract above and why this is a migration. Contents:

1. **The bucket**, idempotent:
   ```sql
   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   values ('media', 'media', true, 4194304,
           array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
   on conflict (id) do update
     set public = excluded.public,
         file_size_limit = excluded.file_size_limit,
         allowed_mime_types = excluded.allowed_mime_types;
   ```
   Why 4 MiB: the app deploys to Vercel through `adapter-auto`, and Vercel caps a function's request body at 4.5 MB. Step 3 uploads through a form action, so the bucket limit must sit under that cap. Direct-to-storage uploads, which would lift the cap, are in `beta-deferred.md`.

2. **Policies on `storage.objects`**, each scoped with `bucket_id = 'media'`. Use `drop policy if exists` before each `create policy`, as `02-content-rls.sql` does.
   - `media_public_read`: `for select to anon, authenticated using (bucket_id = 'media')`. A public bucket serves `/object/public/` URLs without a policy, but this policy keeps listing and `download()` consistent.
   - `media_admin_insert`, `media_admin_update`, `media_admin_delete`: `to authenticated`, with `using` / `with check` set to `bucket_id = 'media' and (select public.current_user_admin())`.

Don't touch policies for any other bucket, and don't `alter table storage.objects`. Supabase owns that table and RLS is already enabled on it.

## 1.2 Migration

```
node_modules/.bin/drizzle-kit generate --custom --name media_storage --config .sveltebuilder/drizzle.config.ts
```

This should produce `supabase/migrations/0003_media_storage.sql` and a journal entry. Paste in `-- supplemental: 09-media-storage.sql` followed by the file's contents, as `0002_dashboard.sql` does.

## 1.3 Apply locally

```
npx supabase@2.119.0 migration up --local
```

If that complains about migration history, fall back to `npx supabase@2.119.0 db query --local --file supabase/supplemental/09-media-storage.sql`, and record which command you used in the commit message.

## Verification

- [ ] `npx supabase@2.119.0 db query --local "select id, public, file_size_limit, allowed_mime_types from storage.buckets"` returns one `media` row with `public = true`.
- [ ] `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'` lists the four `media_*` policies.
- [ ] Re-running the supplemental file succeeds, which shows it's idempotent.
- [ ] `pnpm check` is still at 0 errors and 2 warnings.
- [ ] Commit: `article images: step 1, media storage bucket`.

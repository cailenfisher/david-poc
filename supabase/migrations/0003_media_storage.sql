-- Custom SQL migration file, put your code below! --

-- supplemental: 09-media-storage.sql
-- Media storage: the public `media` bucket for article images
--
-- The public article page builds an image URL as
--   ${PUBLIC_SUPABASE_URL}/storage/v1/object/public/<media_asset.storage_key>
-- so media_asset.storage_key must start with the bucket name, e.g. media/2026/10/<uuid>.webp.
--
-- This is a migration, not a [storage.buckets.*] entry in config.toml, because config.toml
-- only affects the local stack and a hosted project would never get the bucket.
--
-- The 4 MiB limit sits under Vercel's 4.5 MB request body cap for functions, because
-- uploads go through a form action. Idempotent: safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 4194304,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A public bucket serves /object/public/ URLs without a policy; this keeps listing and
-- download() consistent with it.
drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'media');

drop policy if exists media_admin_insert on storage.objects;
create policy media_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select public.current_user_admin()));

drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (select public.current_user_admin()))
  with check (bucket_id = 'media' and (select public.current_user_admin()));

drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select public.current_user_admin()));

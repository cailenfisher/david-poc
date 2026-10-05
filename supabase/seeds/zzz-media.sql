-- Seed images for The Meridian: sourced, licensed and credited.
--
-- Five illustrative images on five published articles. Every file is a Wikimedia Commons
-- work under CC0, CC BY, CC BY-SA or a US-government public-domain mark; the file page, the
-- exact license and the date it was checked are recorded in media_asset_source, and in
-- human-readable form in supabase/seeds/media-sources.md. The files themselves live in
-- supabase/seeds/media/ and reach storage through `supabase seed buckets` (see config.toml).
--
-- The stories are fictional, so the images are generic and every caption says it is
-- illustrative. Nothing here shows a real person or event as if it were the story's.
--
-- Sorts after zz-newsroom.sql because it references that file's articles. Idempotent:
-- every insert is keyed on storage_key or guarded with where not exists.

-- The statements are wrapped in one DO block on purpose: `supabase db query --file` sends the
-- file as a single prepared statement and rejects a file with several, and this seed is applied
-- to hosted projects that way (never through db push, and never as the whole seed.sql).
do $seed$
begin

-- ── Assets ──────────────────────────────────────────────────────────────────
-- media_asset.uploaded_by is NOT NULL, and principals are provisioned just-in-time at first
-- sign-in — a freshly reset database has none. So this joins user_account rather than
-- sub-selecting min(id): with no principal yet the join yields nothing and the seed inserts
-- no images, instead of failing the whole seed on a not-null violation. Re-run the seed
-- after signing in once to get them.
insert into media_asset (media_type, storage_key, width, height, mime_type, uploaded_by)
select 'image', v.storage_key, v.width, v.height, 'image/webp', u.id
from (values
  ('media/2026/10/bus-lane-downtown.webp', 1600, 1067),
  ('media/2026/10/apartment-block-low-rise.webp', 1400, 1050),
  ('media/2026/10/central-bank-building-exterior.webp', 1400, 1050),
  ('media/2026/10/hospital-corridor.webp', 1600, 1200),
  ('media/2026/10/data-center-map-united-states.webp', 1600, 1035)
) as v(storage_key, width, height)
join user_account u on u.id = (select min(id) from public.user_account)
on conflict (storage_key) do nothing;

-- ── Rights and source ───────────────────────────────────────────────────────
-- credit_required is true on every row: CC BY and CC BY-SA demand attribution, and for the
-- public-domain works it is good practice and free.
insert into media_asset_rights (media_asset_id, license, credit_required)
select m.id, v.license::media_license, true
from (values
  ('media/2026/10/bus-lane-downtown.webp', 'creative_commons'),
  ('media/2026/10/apartment-block-low-rise.webp', 'public_domain'),
  ('media/2026/10/central-bank-building-exterior.webp', 'creative_commons'),
  ('media/2026/10/hospital-corridor.webp', 'creative_commons'),
  ('media/2026/10/data-center-map-united-states.webp', 'public_domain')
) as v(storage_key, license)
join media_asset m on m.storage_key = v.storage_key
where not exists (select 1 from media_asset_rights r where r.media_asset_id = m.id);

insert into media_asset_source (media_asset_id, source_url, license_url, retrieved_at)
select m.id, v.source_url, v.license_url, v.retrieved_at::timestamptz
from (values
  ('media/2026/10/bus-lane-downtown.webp', 'https://commons.wikimedia.org/wiki/File:Bus_Rapid_Transit_(26716761740).jpg', 'https://creativecommons.org/licenses/by/2.0/', '2026-10-05'),
  ('media/2026/10/apartment-block-low-rise.webp', 'https://commons.wikimedia.org/wiki/File:Apartment_block,_Tregarthen,_Treverbyn_Road,_St_Ives,_Cornwall_-_September_2022.jpg', 'https://creativecommons.org/publicdomain/zero/1.0/', '2026-10-05'),
  ('media/2026/10/central-bank-building-exterior.webp', 'https://commons.wikimedia.org/wiki/File:Federal_Reserve_Building_(Detroit)_exterior_at_midday,_from_southwest_(1).jpg', 'https://creativecommons.org/licenses/by-sa/4.0/', '2026-10-05'),
  ('media/2026/10/hospital-corridor.webp', 'https://commons.wikimedia.org/wiki/File:Inova_Mount_Vernon_Hospital_third_floor_hallway_by_elevators.jpg', 'https://creativecommons.org/licenses/by-sa/4.0/', '2026-10-05'),
  ('media/2026/10/data-center-map-united-states.webp', 'https://commons.wikimedia.org/wiki/File:Data_center_infrastructure_in_the_United_States.jpg', 'https://creativecommons.org/publicdomain/mark/1.0/', '2026-10-05')
) as v(storage_key, source_url, license_url, retrieved_at)
join media_asset m on m.storage_key = v.storage_key
where not exists (select 1 from media_asset_source s where s.media_asset_id = m.id);

-- ── Copy: alt text, caption, credit — en and fr ─────────────────────────────
insert into local_text_link (slug, scope, entity_id)
select v.slug, 'media_asset', m.id
from (values
  ('media/2026/10/bus-lane-downtown.webp', 'alt_text'),
  ('media/2026/10/bus-lane-downtown.webp', 'caption'),
  ('media/2026/10/bus-lane-downtown.webp', 'credit'),
  ('media/2026/10/apartment-block-low-rise.webp', 'alt_text'),
  ('media/2026/10/apartment-block-low-rise.webp', 'caption'),
  ('media/2026/10/apartment-block-low-rise.webp', 'credit'),
  ('media/2026/10/central-bank-building-exterior.webp', 'alt_text'),
  ('media/2026/10/central-bank-building-exterior.webp', 'caption'),
  ('media/2026/10/central-bank-building-exterior.webp', 'credit'),
  ('media/2026/10/hospital-corridor.webp', 'alt_text'),
  ('media/2026/10/hospital-corridor.webp', 'caption'),
  ('media/2026/10/hospital-corridor.webp', 'credit'),
  ('media/2026/10/data-center-map-united-states.webp', 'alt_text'),
  ('media/2026/10/data-center-map-united-states.webp', 'caption'),
  ('media/2026/10/data-center-map-united-states.webp', 'credit')
) as v(storage_key, slug)
join media_asset m on m.storage_key = v.storage_key
on conflict do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = v.code), v.content
from (values
  ('media/2026/10/bus-lane-downtown.webp', 'alt_text', 'en', 'A wide downtown street with a red bus lane running alongside a glass-roofed bus shelter, between tall office buildings.'),
  ('media/2026/10/bus-lane-downtown.webp', 'alt_text', 'fr', 'Une large rue du centre-ville avec une voie de bus rouge longeant un abribus à toit vitré, entre de grands immeubles de bureaux.'),
  ('media/2026/10/bus-lane-downtown.webp', 'caption', 'en', 'A bus lane and shelter on a downtown street. (Illustrative photo)'),
  ('media/2026/10/bus-lane-downtown.webp', 'caption', 'fr', 'Une voie réservée aux bus et un abribus dans une rue du centre-ville. (Photo d’illustration)'),
  ('media/2026/10/bus-lane-downtown.webp', 'credit', 'en', 'Photo: Paul Sableman / Wikimedia Commons, CC BY 2.0, resized'),
  ('media/2026/10/bus-lane-downtown.webp', 'credit', 'fr', 'Photo : Paul Sableman / Wikimedia Commons, CC BY 2.0, redimensionnée'),
  ('media/2026/10/apartment-block-low-rise.webp', 'alt_text', 'en', 'A two-storey grey apartment block beside a grass lawn and a footpath, under a blue sky.'),
  ('media/2026/10/apartment-block-low-rise.webp', 'alt_text', 'fr', 'Un immeuble d’appartements gris de deux étages, à côté d’une pelouse et d’un sentier, sous un ciel bleu.'),
  ('media/2026/10/apartment-block-low-rise.webp', 'caption', 'en', 'A low-rise apartment block. (Illustrative photo)'),
  ('media/2026/10/apartment-block-low-rise.webp', 'caption', 'fr', 'Un immeuble d’appartements de faible hauteur. (Photo d’illustration)'),
  ('media/2026/10/apartment-block-low-rise.webp', 'credit', 'en', 'Photo: Mutney / Wikimedia Commons, CC0, resized'),
  ('media/2026/10/apartment-block-low-rise.webp', 'credit', 'fr', 'Photo : Mutney / Wikimedia Commons, CC0, redimensionnée'),
  ('media/2026/10/central-bank-building-exterior.webp', 'alt_text', 'en', 'The corner of a large stone-clad bank building with tall windows, seen from the street on a sunny day.'),
  ('media/2026/10/central-bank-building-exterior.webp', 'alt_text', 'fr', 'L’angle d’un grand bâtiment bancaire en pierre aux hautes fenêtres, vu depuis la rue par temps ensoleillé.'),
  ('media/2026/10/central-bank-building-exterior.webp', 'caption', 'en', 'A central bank building. (Illustrative photo)'),
  ('media/2026/10/central-bank-building-exterior.webp', 'caption', 'fr', 'Un bâtiment de banque centrale. (Photo d’illustration)'),
  ('media/2026/10/central-bank-building-exterior.webp', 'credit', 'en', 'Photo: 42-BRT / Wikimedia Commons, CC BY-SA 4.0, resized'),
  ('media/2026/10/central-bank-building-exterior.webp', 'credit', 'fr', 'Photo : 42-BRT / Wikimedia Commons, CC BY-SA 4.0, redimensionnée'),
  ('media/2026/10/hospital-corridor.webp', 'alt_text', 'en', 'An empty hospital hallway with a blue wall, a wooden sign listing patient rooms, and a door on either side.'),
  ('media/2026/10/hospital-corridor.webp', 'alt_text', 'fr', 'Un couloir d’hôpital vide avec un mur bleu, un panneau en bois indiquant des chambres de patients et une porte de chaque côté.'),
  ('media/2026/10/hospital-corridor.webp', 'caption', 'en', 'A hospital hallway. (Illustrative photo)'),
  ('media/2026/10/hospital-corridor.webp', 'caption', 'fr', 'Un couloir d’hôpital. (Photo d’illustration)'),
  ('media/2026/10/hospital-corridor.webp', 'credit', 'en', 'Photo: Ser Amantio di Nicolao / Wikimedia Commons, CC BY-SA 4.0, resized'),
  ('media/2026/10/hospital-corridor.webp', 'credit', 'fr', 'Photo : Ser Amantio di Nicolao / Wikimedia Commons, CC BY-SA 4.0, redimensionnée'),
  ('media/2026/10/data-center-map-united-states.webp', 'alt_text', 'en', 'A map of the United States showing data center locations, power transmission lines and fiber-optic routes in orange, red and yellow.'),
  ('media/2026/10/data-center-map-united-states.webp', 'alt_text', 'fr', 'Une carte des États-Unis montrant l’emplacement des centres de données, les lignes de transport d’électricité et les routes de fibre optique en orange, rouge et jaune.'),
  ('media/2026/10/data-center-map-united-states.webp', 'caption', 'en', 'Data centers across the United States, 2025. (Illustrative map)'),
  ('media/2026/10/data-center-map-united-states.webp', 'caption', 'fr', 'Les centres de données aux États-Unis, 2025. (Carte d’illustration)'),
  ('media/2026/10/data-center-map-united-states.webp', 'credit', 'en', 'Map: U.S. Department of Energy / NREL / Wikimedia Commons, public domain, resized'),
  ('media/2026/10/data-center-map-united-states.webp', 'credit', 'fr', 'Carte : U.S. Department of Energy / NREL / Wikimedia Commons, domaine public, redimensionnée')
) as v(storage_key, slug, code, content)
join media_asset m on m.storage_key = v.storage_key
join local_text_link l on l.scope = 'media_asset' and l.slug = v.slug and l.entity_id = m.id
on conflict (link, locale) do nothing;

-- ── Image blocks ────────────────────────────────────────────────────────────
-- First in the body, which also makes the image the og:image. position has no unique
-- constraint and only ordering matters, so one below the current minimum puts it first
-- without renumbering the existing blocks.
insert into article_block (article_id, block_type, position, content, media_asset_id)
select a.id, 'image',
       (select min(b.position) from article_block b where b.article_id = a.id) - 1,
       '{}'::jsonb, m.id
from (values
  ('council-advances-transit-levy', 'media/2026/10/bus-lane-downtown.webp'),
  ('housing-authority-vacancy-audit', 'media/2026/10/apartment-block-low-rise.webp'),
  ('central-bank-holds-benchmark-rate', 'media/2026/10/central-bank-building-exterior.webp'),
  ('nurses-ratify-three-year-contract', 'media/2026/10/hospital-corridor.webp'),
  ('tech-leaders-sign-ai-safety-standards', 'media/2026/10/data-center-map-united-states.webp')
) as v(article_slug, storage_key)
join article a on a.canonical_slug = v.article_slug
join media_asset m on m.storage_key = v.storage_key
where not exists (
  select 1 from article_block x where x.article_id = a.id and x.media_asset_id = m.id
);

end
$seed$;

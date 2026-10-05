-- Lead image: labels for the editor's choice of which image leads an article.
--
-- Same scope and shape as the image-block labels in zz-newsroom.sql. Its own file so a hosted
-- project can take it alone with `supabase db query --linked --file`, which sends a file as one
-- statement — hence the DO block. Idempotent: links on conflict do nothing, copy likewise.
do $seed$
begin

insert into local_text_link (slug, scope, entity_id)
select v.slug, 'content', null
from (values
  ('content.admin.lead_image'),
  ('content.admin.lead_image_hint'),
  ('content.admin.lead_image_automatic')
) as v(slug)
on conflict do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = v.code), v.content
from (values
  ('content.admin.lead_image', 'en', 'Lead image'),
  ('content.admin.lead_image', 'fr', 'Image principale'),
  ('content.admin.lead_image_hint', 'en', 'Shown above the article, on its cards and when it is shared. Choose from the images in the body.'),
  ('content.admin.lead_image_hint', 'fr', 'Affichée au-dessus de l’article, sur ses vignettes et lors des partages. Choisissez parmi les images du corps.'),
  ('content.admin.lead_image_automatic', 'en', 'First image in the body'),
  ('content.admin.lead_image_automatic', 'fr', 'Première image du corps')
) as v(slug, code, content)
join local_text_link l on l.scope = 'content' and l.slug = v.slug and l.entity_id is null
on conflict (link, locale) do nothing;

end
$seed$;

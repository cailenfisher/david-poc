-- ─────────────────────────────────────────────────────────────────────────────
-- Visitor analytics copy and admin navigation
--
-- Screen and widget labels are application copy under the `page_view` scope with
-- entity_id null, loaded by the screens that need them through loadScopedCopy().
-- The nav label is global (scope null) because the admin layout resolves nav
-- slugs with no scope argument — see the note in zz-newsroom.sql.
--
-- Re-runnable: `on conflict do nothing` throughout.
-- ─────────────────────────────────────────────────────────────────────────────
insert into local_text_link (slug, scope, entity_id)
select v.slug, 'page_view', null
from (values
  ('page_view.title'), ('page_view.widget_title'), ('page_view.view_report'),
  ('page_view.window'), ('page_view.window_days'),
  ('page_view.view_count'), ('page_view.visitor_count'), ('page_view.views_per_visitor'),
  ('page_view.daily_title'), ('page_view.day'), ('page_view.show_data'),
  ('page_view.top_path'), ('page_view.path'),
  ('page_view.top_referrer'), ('page_view.referrer'), ('page_view.direct'),
  ('page_view.empty'), ('page_view.privacy_hint')
) as v(slug)
on conflict do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = v.code), v.content
from (values
  ('page_view.title', 'en', 'Visitors'),
  ('page_view.title', 'fr', 'Visiteurs'),
  ('page_view.widget_title', 'en', 'Visitors, last 7 days'),
  ('page_view.widget_title', 'fr', 'Visiteurs, 7 derniers jours'),
  ('page_view.view_report', 'en', 'Full report'),
  ('page_view.view_report', 'fr', 'Rapport complet'),
  ('page_view.window', 'en', 'Period'),
  ('page_view.window', 'fr', 'Période'),
  ('page_view.window_days', 'en', 'Last {$days} days'),
  ('page_view.window_days', 'fr', '{$days} derniers jours'),
  ('page_view.view_count', 'en', 'Page views'),
  ('page_view.view_count', 'fr', 'Pages vues'),
  ('page_view.visitor_count', 'en', 'Visitors'),
  ('page_view.visitor_count', 'fr', 'Visiteurs'),
  ('page_view.views_per_visitor', 'en', 'Views per visitor'),
  ('page_view.views_per_visitor', 'fr', 'Pages par visiteur'),
  ('page_view.daily_title', 'en', 'Page views per day'),
  ('page_view.daily_title', 'fr', 'Pages vues par jour'),
  ('page_view.day', 'en', 'Day'),
  ('page_view.day', 'fr', 'Jour'),
  ('page_view.show_data', 'en', 'Show as a table'),
  ('page_view.show_data', 'fr', 'Afficher sous forme de tableau'),
  ('page_view.top_path', 'en', 'Top pages'),
  ('page_view.top_path', 'fr', 'Pages les plus vues'),
  ('page_view.path', 'en', 'Page'),
  ('page_view.path', 'fr', 'Page'),
  ('page_view.top_referrer', 'en', 'Top referrers'),
  ('page_view.top_referrer', 'fr', 'Principaux référents'),
  ('page_view.referrer', 'en', 'Referrer'),
  ('page_view.referrer', 'fr', 'Référent'),
  ('page_view.direct', 'en', 'Direct or unknown'),
  ('page_view.direct', 'fr', 'Direct ou inconnu'),
  ('page_view.empty', 'en', 'No visits recorded in this period.'),
  ('page_view.empty', 'fr', 'Aucune visite enregistrée sur cette période.'),
  ('page_view.privacy_hint', 'en', 'Public pages only. Visitors are counted by an anonymous cookie; admin screens are never recorded. Days are UTC.'),
  ('page_view.privacy_hint', 'fr', 'Pages publiques uniquement. Les visiteurs sont comptés par un cookie anonyme ; les écrans d''administration ne sont jamais enregistrés. Jours en UTC.')
) as v(slug, code, content)
join local_text_link l on l.scope = 'page_view' and l.slug = v.slug and l.entity_id is null
on conflict (link, locale) do nothing;

insert into local_text_link (slug, scope, entity_id)
values ('admin.nav.page_view', null, null)
on conflict do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = v.code), v.content
from (values
  ('admin.nav.page_view', 'en', 'Readership'),
  ('admin.nav.page_view', 'fr', 'Lectorat')
) as v(slug, code, content)
join local_text_link l on l.slug = v.slug and l.scope is null and l.entity_id is null
on conflict (link, locale) do nothing;

insert into navigation_item (local_text_link_id, href, scope, sort_order, active)
select l.id, '/admin/page-view', 'admin', 19, true
from local_text_link l
where l.slug = 'admin.nav.page_view' and l.scope is null and l.entity_id is null
on conflict (href, scope) do nothing;

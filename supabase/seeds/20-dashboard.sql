-- ─────────────────────────────────────────────────────────────────────────────
-- Admin dashboard copy
--
-- Widget labels are application copy under the `dashboard` scope with entity_id
-- null, loaded by the dashboard through loadScopedCopy(). The page title stays on
-- the base template's global `admin.dashboard.title`.
--
-- Re-runnable: `on conflict do nothing` throughout.
-- ─────────────────────────────────────────────────────────────────────────────
insert into local_text_link (slug, scope, entity_id)
select v.slug, 'dashboard', null
from (values
  ('dashboard.pipeline.title'), ('dashboard.pipeline.open'),
  ('dashboard.active.title'), ('dashboard.active.open'), ('dashboard.active.empty'),
  ('dashboard.active.due'), ('dashboard.active.overdue'), ('dashboard.active.embargoed'),
  ('dashboard.trending.title'), ('dashboard.trending.open'), ('dashboard.trending.empty'),
  ('dashboard.trending.caption'),
  ('dashboard.comment.title'), ('dashboard.comment.open'),
  ('dashboard.comment.pending'), ('dashboard.comment.flagged')
) as v(slug)
on conflict do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = v.code), v.content
from (values
  ('dashboard.pipeline.title', 'en', 'Story pipeline'),
  ('dashboard.pipeline.title', 'fr', 'Suivi des sujets'),
  ('dashboard.pipeline.open', 'en', 'Open board'),
  ('dashboard.pipeline.open', 'fr', 'Ouvrir le tableau'),
  ('dashboard.active.title', 'en', 'Active stories'),
  ('dashboard.active.title', 'fr', 'Sujets en cours'),
  ('dashboard.active.open', 'en', 'All stories'),
  ('dashboard.active.open', 'fr', 'Tous les articles'),
  ('dashboard.active.empty', 'en', 'Nothing in progress.'),
  ('dashboard.active.empty', 'fr', 'Aucun sujet en cours.'),
  ('dashboard.active.due', 'en', 'Due'),
  ('dashboard.active.due', 'fr', 'Échéance'),
  ('dashboard.active.overdue', 'en', 'Overdue'),
  ('dashboard.active.overdue', 'fr', 'En retard'),
  ('dashboard.active.embargoed', 'en', 'Embargoed until'),
  ('dashboard.active.embargoed', 'fr', 'Sous embargo jusqu''au'),
  ('dashboard.trending.title', 'en', 'Trending stories, last 7 days'),
  ('dashboard.trending.title', 'fr', 'Articles les plus lus, 7 derniers jours'),
  ('dashboard.trending.open', 'en', 'Readership'),
  ('dashboard.trending.open', 'fr', 'Lectorat'),
  ('dashboard.trending.empty', 'en', 'No story views recorded in this period.'),
  ('dashboard.trending.empty', 'fr', 'Aucune lecture d''article enregistrée sur cette période.'),
  ('dashboard.trending.caption', 'en', 'Ranked by page views'),
  ('dashboard.trending.caption', 'fr', 'Classés par pages vues'),
  ('dashboard.comment.title', 'en', 'Reader comments'),
  ('dashboard.comment.title', 'fr', 'Commentaires des lecteurs'),
  ('dashboard.comment.open', 'en', 'Moderate'),
  ('dashboard.comment.open', 'fr', 'Modérer'),
  ('dashboard.comment.pending', 'en', 'Awaiting review'),
  ('dashboard.comment.pending', 'fr', 'En attente d''examen'),
  ('dashboard.comment.flagged', 'en', 'Flagged'),
  ('dashboard.comment.flagged', 'fr', 'Signalés')
) as v(slug, code, content)
join local_text_link l on l.scope = 'dashboard' and l.slug = v.slug and l.entity_id is null
on conflict (link, locale) do nothing;

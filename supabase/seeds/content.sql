-- Seed data for @sveltebuilder/content
-- Depends on: locale table seeded (base seed), local_text_link, local_text
--
-- The module shipped with no seed at all, which made it structurally inert rather than
-- merely empty: every public query resolves the slug 'published' through article_status, and
-- with no rows in that table there is no such status, so nothing can ever be published and
-- every page renders nothing. The workflow statuses below are the minimum for the module to
-- function; the sample article is so a fresh scaffold has something to show.
--
-- Conventions, per CLAUDE.md: no manual IDs, resolve foreign keys by slug, resolve locale
-- IDs by code, `on conflict do nothing` everywhere so the seed is re-runnable.

-- ──────────────────────────────────────────────────────────────────────────────
-- Article workflow statuses
--
-- Ordinal is the workflow order, which is what the admin screens sort by. 'published' is
-- the one slug with meaning in code — the public read policy and every public query test
-- for it by name — so it must exist under exactly this spelling.
-- ──────────────────────────────────────────────────────────────────────────────

insert into article_status (slug, ordinal) values
  ('pitch',     10),
  ('draft',     20),
  ('in_review', 30),
  ('ready',     40),
  ('published', 50),
  ('archived',  60)
on conflict (slug) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- Publish checklist
--
-- The gate an article passes before publishing. `required` distinguishes a blocker from a
-- reminder; an editor can publish past an unticked optional item.
-- ──────────────────────────────────────────────────────────────────────────────

insert into publish_checklist_item (slug, ordinal, required) values
  ('headline_approved',   10, true),
  ('copy_edited',         20, true),
  ('legal_reviewed',      30, false),
  ('images_credited',     40, true),
  ('links_checked',       50, false),
  ('seo_fields_complete', 60, false)
on conflict (slug) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- Publisher identity
--
-- A singleton: the site's own identity, read by the RSS feed, the sitemaps and the
-- NewsArticle JSON-LD. No slug to conflict on, so guarded by a not-exists instead.
-- ──────────────────────────────────────────────────────────────────────────────

insert into publisher_profile (url)
select 'https://example.com'
where not exists (select 1 from publisher_profile);

-- ──────────────────────────────────────────────────────────────────────────────
-- Sections and topics
-- ──────────────────────────────────────────────────────────────────────────────

insert into section (slug, ordinal, active) values
  ('news',     10, true),
  ('opinion',  20, true),
  ('business', 30, true),
  ('culture',  40, true)
on conflict (slug) do nothing;

insert into topic (slug, active) values
  ('local-government', true),
  ('transport',        true),
  ('housing',          true)
on conflict (slug) do nothing;

insert into tag (slug) values
  ('explainer'),
  ('investigation')
on conflict (slug) do nothing;

insert into newsletter (slug, active) values
  ('daily-briefing', true)
on conflict (slug) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- A sample published article
--
-- One article, filed in a section, with a byline and three blocks, so a fresh scaffold
-- renders a real page rather than an empty list. Published and unembargoed, so the public
-- read policy admits it.
-- ──────────────────────────────────────────────────────────────────────────────

insert into author_profile (slug, active) values
  ('sample-author', true)
on conflict (slug) do nothing;

insert into article (article_status_id, canonical_slug, published_at)
select (select id from article_status where slug = 'published'),
       'welcome-to-sveltebuilder-content',
       now()
on conflict (canonical_slug) do nothing;

insert into article_section (article_id, section_id)
select a.id, s.id
from article a, section s
where a.canonical_slug = 'welcome-to-sveltebuilder-content'
  and s.slug = 'news'
on conflict do nothing;

insert into article_byline (article_id, author_profile_id, position)
select a.id, p.id, 0
from article a, author_profile p
where a.canonical_slug = 'welcome-to-sveltebuilder-content'
  and p.slug = 'sample-author'
on conflict do nothing;

-- Blocks carry their prose in the i18n tables like everything else, so `content` holds only
-- structure. A paragraph block's text is entity-bound copy keyed by the block's own id,
-- which is why the copy inserts below join back through position.
--
-- Guarded by a not-exists rather than `on conflict do nothing`: (article_id, position) has an
-- index but no unique constraint, so there is no conflict for Postgres to detect and the
-- clause would be a silent no-op — re-running the seed would add three more blocks each time.
insert into article_block (article_id, block_type, position, content)
select a.id, v.block_type::article_block_type, v.position, '{}'::jsonb
from article a,
  (values ('heading', 0), ('paragraph', 1), ('paragraph', 2)) as v(block_type, position)
where a.canonical_slug = 'welcome-to-sveltebuilder-content'
  and not exists (
    select 1 from article_block b
    where b.article_id = a.id and b.position = v.position
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- local_text_link — entity-bound copy
-- ──────────────────────────────────────────────────────────────────────────────

insert into local_text_link (slug, scope, entity_id)
select 'name', 'article_status', s.id from article_status s
on conflict do nothing;

insert into local_text_link (slug, scope, entity_id)
select 'label', 'publish_checklist_item', i.id from publish_checklist_item i
on conflict do nothing;

insert into local_text_link (slug, scope, entity_id)
select 'name', 'section', s.id from section s
on conflict do nothing;

insert into local_text_link (slug, scope, entity_id)
select 'name', 'topic', t.id from topic t
on conflict do nothing;

insert into local_text_link (slug, scope, entity_id)
select 'name', 'tag', t.id from tag t
on conflict do nothing;

insert into local_text_link (slug, scope, entity_id)
select 'name', 'newsletter', n.id from newsletter n
on conflict do nothing;

insert into local_text_link (slug, scope, entity_id)
select 'name', 'publisher_profile', p.id from publisher_profile p
on conflict do nothing;

insert into local_text_link (slug, scope, entity_id)
select 'name', 'author_profile', p.id from author_profile p
on conflict do nothing;

-- An article's headline, its dek and the body of each block. The slugs are what ArticleView
-- reads — 'headline' and 'dek' — so they are spelled out one statement each rather than
-- generated from a values list: a literal slug beside its literal scope is the form the
-- screen-bundle suite can read back, and a seed it cannot parse is a seed nothing checks.
insert into local_text_link (slug, scope, entity_id)
select 'headline', 'article', a.id from article a
where a.canonical_slug = 'welcome-to-sveltebuilder-content'
on conflict do nothing;

insert into local_text_link (slug, scope, entity_id)
select 'dek', 'article', a.id from article a
where a.canonical_slug = 'welcome-to-sveltebuilder-content'
on conflict do nothing;

insert into local_text_link (slug, scope, entity_id)
select 'text', 'article_block', b.id
from article_block b
join article a on a.id = b.article_id
where a.canonical_slug = 'welcome-to-sveltebuilder-content'
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- English copy
-- ──────────────────────────────────────────────────────────────────────────────

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.display
from (values
  ('pitch',     'Pitch'),
  ('draft',     'Draft'),
  ('in_review', 'In review'),
  ('ready',     'Ready'),
  ('published', 'Published'),
  ('archived',  'Archived')
) as v(entity_slug, display)
join article_status s on s.slug = v.entity_slug
join local_text_link l on l.slug = 'name' and l.scope = 'article_status' and l.entity_id = s.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.display
from (values
  ('headline_approved',   'Headline approved'),
  ('copy_edited',         'Copy edited'),
  ('legal_reviewed',      'Legal reviewed'),
  ('images_credited',     'Images credited'),
  ('links_checked',       'Links checked'),
  ('seo_fields_complete', 'SEO fields complete')
) as v(entity_slug, display)
join publish_checklist_item i on i.slug = v.entity_slug
join local_text_link l
  on l.slug = 'label' and l.scope = 'publish_checklist_item' and l.entity_id = i.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.display
from (values
  ('news', 'News'), ('opinion', 'Opinion'), ('business', 'Business'), ('culture', 'Culture')
) as v(entity_slug, display)
join section s on s.slug = v.entity_slug
join local_text_link l on l.slug = 'name' and l.scope = 'section' and l.entity_id = s.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.display
from (values
  ('local-government', 'Local government'), ('transport', 'Transport'), ('housing', 'Housing')
) as v(entity_slug, display)
join topic t on t.slug = v.entity_slug
join local_text_link l on l.slug = 'name' and l.scope = 'topic' and l.entity_id = t.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.display
from (values ('explainer', 'Explainer'), ('investigation', 'Investigation')) as v(entity_slug, display)
join tag t on t.slug = v.entity_slug
join local_text_link l on l.slug = 'name' and l.scope = 'tag' and l.entity_id = t.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), 'Daily Briefing'
from newsletter n
join local_text_link l on l.slug = 'name' and l.scope = 'newsletter' and l.entity_id = n.id
where n.slug = 'daily-briefing'
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), 'The Example Post'
from publisher_profile p
join local_text_link l on l.slug = 'name' and l.scope = 'publisher_profile' and l.entity_id = p.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), 'Sample Author'
from author_profile p
join local_text_link l
  on l.slug = 'name' and l.scope = 'author_profile' and l.entity_id = p.id
where p.slug = 'sample-author'
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.content
from (values
  ('headline', 'Welcome to SvelteBuilder Content'),
  ('dek',      'A sample article, seeded so a fresh scaffold has a real page to render.')
) as v(slug, content)
join article a on a.canonical_slug = 'welcome-to-sveltebuilder-content'
join local_text_link l on l.slug = v.slug and l.scope = 'article' and l.entity_id = a.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.content
from (values
  (0, 'What this module gives you'),
  (1, 'The article you are reading is seeded data: one article, three blocks, a byline and a section. Its text lives in the i18n tables rather than in a column, which is why switching locale rewrites this paragraph rather than falling back to English.'),
  (2, 'Replace it, or delete it and write your own. The schema, the publish workflow and the feeds are the parts worth keeping.')
) as v(position, content)
join article a on a.canonical_slug = 'welcome-to-sveltebuilder-content'
join article_block b on b.article_id = a.id and b.position = v.position
join local_text_link l on l.slug = 'text' and l.scope = 'article_block' and l.entity_id = b.id
on conflict (link, locale) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- French copy
-- ──────────────────────────────────────────────────────────────────────────────

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.display
from (values
  ('pitch',     'Proposition'),
  ('draft',     'Brouillon'),
  ('in_review', 'En révision'),
  ('ready',     'Prêt'),
  ('published', 'Publié'),
  ('archived',  'Archivé')
) as v(entity_slug, display)
join article_status s on s.slug = v.entity_slug
join local_text_link l on l.slug = 'name' and l.scope = 'article_status' and l.entity_id = s.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.display
from (values
  ('headline_approved',   'Titre approuvé'),
  ('copy_edited',         'Texte révisé'),
  ('legal_reviewed',      'Validation juridique'),
  ('images_credited',     'Images créditées'),
  ('links_checked',       'Liens vérifiés'),
  ('seo_fields_complete', 'Champs SEO complets')
) as v(entity_slug, display)
join publish_checklist_item i on i.slug = v.entity_slug
join local_text_link l
  on l.slug = 'label' and l.scope = 'publish_checklist_item' and l.entity_id = i.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.display
from (values
  ('news', 'Actualités'), ('opinion', 'Opinion'), ('business', 'Économie'), ('culture', 'Culture')
) as v(entity_slug, display)
join section s on s.slug = v.entity_slug
join local_text_link l on l.slug = 'name' and l.scope = 'section' and l.entity_id = s.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.display
from (values
  ('local-government', 'Collectivités locales'), ('transport', 'Transport'), ('housing', 'Logement')
) as v(entity_slug, display)
join topic t on t.slug = v.entity_slug
join local_text_link l on l.slug = 'name' and l.scope = 'topic' and l.entity_id = t.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.display
from (values ('explainer', 'Explication'), ('investigation', 'Enquête')) as v(entity_slug, display)
join tag t on t.slug = v.entity_slug
join local_text_link l on l.slug = 'name' and l.scope = 'tag' and l.entity_id = t.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), 'Le point quotidien'
from newsletter n
join local_text_link l on l.slug = 'name' and l.scope = 'newsletter' and l.entity_id = n.id
where n.slug = 'daily-briefing'
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), 'The Example Post'
from publisher_profile p
join local_text_link l on l.slug = 'name' and l.scope = 'publisher_profile' and l.entity_id = p.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), 'Auteur exemple'
from author_profile p
join local_text_link l
  on l.slug = 'name' and l.scope = 'author_profile' and l.entity_id = p.id
where p.slug = 'sample-author'
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.content
from (values
  ('headline', 'Bienvenue dans SvelteBuilder Content'),
  ('dek',      'Un article d''exemple, pour qu''un projet neuf ait une vraie page à afficher.')
) as v(slug, content)
join article a on a.canonical_slug = 'welcome-to-sveltebuilder-content'
join local_text_link l on l.slug = v.slug and l.scope = 'article' and l.entity_id = a.id
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.content
from (values
  (0, 'Ce que ce module vous apporte'),
  (1, 'L''article que vous lisez est une donnée d''amorçage : un article, trois blocs, une signature et une rubrique. Son texte vit dans les tables i18n plutôt que dans une colonne, ce qui explique pourquoi changer de langue réécrit ce paragraphe au lieu de revenir à l''anglais.'),
  (2, 'Remplacez-le, ou supprimez-le et écrivez le vôtre. Le schéma, le flux de publication et les flux de syndication sont les parties qui méritent d''être conservées.')
) as v(position, content)
join article a on a.canonical_slug = 'welcome-to-sveltebuilder-content'
join article_block b on b.article_id = a.id and b.position = v.position
join local_text_link l on l.slug = 'text' and l.scope = 'article_block' and l.entity_id = b.id
on conflict (link, locale) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- Screen copy — article bundle
--
-- Application-level copy for this module lives under scope 'content' with a null entity_id,
-- which is what the screens load through loadScopedCopy. Entity-bound copy — a headline, a
-- block's text — is keyed by entity id instead and loaded by id, because the 'article' scope
-- is unbounded.
-- ──────────────────────────────────────────────────────────────────────────────

insert into local_text_link (slug, scope, entity_id)
values
  ('content.comments.heading',        'content', null),
  ('content.comments.leave',          'content', null),
  ('content.comments.name',           'content', null),
  ('content.comments.email',          'content', null),
  ('content.comments.body',           'content', null),
  ('content.comments.submit',         'content', null),
  ('content.comments.pending',        'content', null)
on conflict do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.content
from (values
  ('content.comments.heading',        'Comments'),
  ('content.comments.leave',          'Leave a comment'),
  ('content.comments.name',           'Name'),
  ('content.comments.email',          'Email'),
  ('content.comments.body',           'Comment'),
  ('content.comments.submit',         'Submit comment'),
  ('content.comments.pending',        'Your comment has been submitted and is awaiting moderation.')
) as v(slug, content)
join local_text_link l on l.slug = v.slug and l.scope = 'content' and l.entity_id is null
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.content
from (values
  ('content.comments.heading',        'Commentaires'),
  ('content.comments.leave',          'Laisser un commentaire'),
  ('content.comments.name',           'Nom'),
  ('content.comments.email',          'Courriel'),
  ('content.comments.body',           'Commentaire'),
  ('content.comments.submit',         'Envoyer'),
  ('content.comments.pending',        'Votre commentaire a été envoyé et attend la modération.')
) as v(slug, content)
join local_text_link l on l.slug = v.slug and l.scope = 'content' and l.entity_id is null
on conflict (link, locale) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- Screen copy — section bundle
-- ──────────────────────────────────────────────────────────────────────────────

insert into local_text_link (slug, scope, entity_id)
values
  ('content.section.subsections',     'content', null),
  ('content.section.pagination',      'content', null),
  ('content.section.empty',           'content', null)
on conflict do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.content
from (values
  ('content.section.subsections',     'Subsections'),
  ('content.section.pagination',      'Article pages'),
  ('content.section.empty',           'Nothing published here yet.')
) as v(slug, content)
join local_text_link l on l.slug = v.slug and l.scope = 'content' and l.entity_id is null
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.content
from (values
  ('content.section.subsections',     'Sous-rubriques'),
  ('content.section.pagination',      'Pages d''articles'),
  ('content.section.empty',           'Rien de publié pour le moment.')
) as v(slug, content)
join local_text_link l on l.slug = v.slug and l.scope = 'content' and l.entity_id is null
on conflict (link, locale) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- Screen copy — feeds bundle
--
-- content.feed.title is a fallback for a scaffold with no publisher_profile seeded; normally a
-- feed titles itself after the publication's own name.
-- ──────────────────────────────────────────────────────────────────────────────

insert into local_text_link (slug, scope, entity_id)
values
  ('content.feed.title',              'content', null),
  ('content.feed.description',        'content', null)
on conflict do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.content
from (values
  ('content.feed.title',              'Latest articles'),
  ('content.feed.description',        'The most recently published articles.')
) as v(slug, content)
join local_text_link l on l.slug = v.slug and l.scope = 'content' and l.entity_id is null
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.content
from (values
  ('content.feed.title',              'Derniers articles'),
  ('content.feed.description',        'Les articles les plus récemment publiés.')
) as v(slug, content)
join local_text_link l on l.slug = v.slug and l.scope = 'content' and l.entity_id is null
on conflict (link, locale) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- Screen copy — preview bundle
-- ──────────────────────────────────────────────────────────────────────────────

insert into local_text_link (slug, scope, entity_id)
values
  ('content.preview.title_prefix',      'content', null),
  ('content.preview.banner',            'content', null)
on conflict do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.content
from (values
  ('content.preview.title_prefix',      '[Preview]'),
  ('content.preview.banner',            'Preview mode — this article is not published.')
) as v(slug, content)
join local_text_link l on l.slug = v.slug and l.scope = 'content' and l.entity_id is null
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.content
from (values
  ('content.preview.title_prefix',      '[Aperçu]'),
  ('content.preview.banner',            'Mode aperçu — cet article nest pas publié.')
) as v(slug, content)
join local_text_link l on l.slug = v.slug and l.scope = 'content' and l.entity_id is null
on conflict (link, locale) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- Screen copy — admin-article bundle
-- ──────────────────────────────────────────────────────────────────────────────

insert into local_text_link (slug, scope, entity_id)
values
  ('content.admin.articles',            'content', null),
  ('content.admin.new',                 'content', null),
  ('content.admin.create',              'content', null),
  ('content.admin.empty',               'content', null),
  ('content.admin.headline',            'content', null),
  ('content.admin.slug',                'content', null),
  ('content.admin.status',              'content', null),
  ('content.admin.created',             'content', null),
  ('content.admin.filter_all',          'content', null),
  ('content.admin.filter_status',       'content', null),
  ('content.admin.body',                'content', null),
  ('content.admin.body_empty',          'content', null),
  ('content.admin.block_type',          'content', null),
  ('content.admin.block_text',          'content', null),
  ('content.admin.filing',              'content', null),
  ('content.admin.sections',            'content', null),
  ('content.admin.bylines',             'content', null),
  ('content.admin.workflow',            'content', null),
  ('content.admin.checklist',           'content', null),
  ('content.admin.required',            'content', null),
  ('content.admin.publish_blocked',     'content', null)
on conflict do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'en'), v.content
from (values
  ('content.admin.articles',            'Articles'),
  ('content.admin.new',                 'New article'),
  ('content.admin.create',              'Create article'),
  ('content.admin.empty',               'No articles yet.'),
  ('content.admin.headline',            'Headline'),
  ('content.admin.slug',                'URL slug'),
  ('content.admin.status',              'Status'),
  ('content.admin.created',             'Created'),
  ('content.admin.filter_all',          'All'),
  ('content.admin.filter_status',       'Filter articles by status'),
  ('content.admin.body',                'Body'),
  ('content.admin.body_empty',          'No blocks yet.'),
  ('content.admin.block_type',          'Type'),
  ('content.admin.block_text',          'Text'),
  ('content.admin.filing',              'Filing'),
  ('content.admin.sections',            'Sections'),
  ('content.admin.bylines',             'Bylines'),
  ('content.admin.workflow',            'Workflow'),
  ('content.admin.checklist',           'Publish checklist'),
  ('content.admin.required',            'Required'),
  ('content.admin.publish_blocked',     'Publishing is blocked until every required item is ticked.')
) as v(slug, content)
join local_text_link l on l.slug = v.slug and l.scope = 'content' and l.entity_id is null
on conflict (link, locale) do nothing;

insert into local_text (link, locale, content)
select l.id, (select id from locale where code = 'fr'), v.content
from (values
  ('content.admin.articles',            'Articles'),
  ('content.admin.new',                 'Nouvel article'),
  ('content.admin.create',              'Créer l''article'),
  ('content.admin.empty',               'Aucun article.'),
  ('content.admin.headline',            'Titre'),
  ('content.admin.slug',                'Identifiant d''URL'),
  ('content.admin.status',              'Statut'),
  ('content.admin.created',             'Créé'),
  ('content.admin.filter_all',          'Tous'),
  ('content.admin.filter_status',       'Filtrer les articles par statut'),
  ('content.admin.body',                'Corps'),
  ('content.admin.body_empty',          'Aucun bloc.'),
  ('content.admin.block_type',          'Type'),
  ('content.admin.block_text',          'Texte'),
  ('content.admin.filing',              'Classement'),
  ('content.admin.sections',            'Rubriques'),
  ('content.admin.bylines',             'Signatures'),
  ('content.admin.workflow',            'Flux de publication'),
  ('content.admin.checklist',           'Liste de contrôle'),
  ('content.admin.required',            'Obligatoire'),
  ('content.admin.publish_blocked',     'La publication est bloquée tant que tous les éléments obligatoires ne sont pas cochés.')
) as v(slug, content)
join local_text_link l on l.slug = v.slug and l.scope = 'content' and l.entity_id is null
on conflict (link, locale) do nothing;

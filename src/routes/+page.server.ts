import { error, redirect } from '@sveltejs/kit';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { ArticleRow } from '@sveltebuilder/content/views';
import {
  ARTICLE_COLUMNS,
  STORAGE_BASE_URL,
  loadLeadMediaAssets,
  toArticleRow,
  toOne,
  type RawArticle,
} from './article-rows';
import type { PageServerLoad } from './$types';

// POC ADDITION — the front page.
//
// The content module ships no `front` screen bundle, so a scaffolded project's root
// route is the base template's stub. Everything this page needs already exists: the
// `front` and `front_slot` tables, their public-read policies, and ArticleCard's
// lead/secondary/river/brief variants, which match the front_layout_variant enum one
// for one. What is missing is the screen and a FrontPageView type in the module's
// exported views.
//
// No auth guard, same as the other public screens: the module's RLS decides what a
// reader sees. The !inner on the article embed is what makes that work here — a slot
// pointing at a draft or an embargoed story drops out of the join entirely rather
// than arriving as a null the mapping would have to invent a value for.

/** A curated slot, resolved to the article it places. Candidate for the module's views. */
export type FrontSlotRow = {
  position: number;
  layoutVariant: 'lead' | 'secondary' | 'river' | 'brief';
  pinnedUntil: string | null;
  article: ArticleRow;
};

export const load: PageServerLoad = async ({ locals, url }) => {
  // ArticleCard hardcodes its topic links to `/?topic=<slug>`. Rather than make the
  // front a filter surface, send them to the topic's own page — a topic is something
  // a newsroom wants indexed, not a homepage query state. 308 so the redirect is
  // cacheable and crawlers treat the destination as canonical.
  const topicParam = url.searchParams.get('topic');
  if (topicParam) throw redirect(308, `/topic/${encodeURIComponent(topicParam)}`);

  const frontResult = await locals.supabase
    .from('front')
    .select('id, section_id, slug, active, created_at')
    .eq('slug', 'home')
    .eq('active', true)
    .maybeSingle();

  if (frontResult.error) throw error(500, 'Failed to load the front.');

  // A project that has not curated a front yet is not an error — it simply has no
  // hand-placed stories, and the page falls back to the most recent published ones.
  const front = frontResult.data;

  const [slotResult, latestResult, sectionResult] = await Promise.all([
    front
      ? locals.supabase
          .from('front_slot')
          .select(`position, layout_variant, pinned_until, article!inner(${ARTICLE_COLUMNS})`)
          .eq('front_id', front.id)
          // Image blocks only: a card needs its picture, not the body. See ARTICLE_COLUMNS.
          .eq('article.article_block.block_type', 'image')
          .order('position')
      : Promise.resolve({ data: [], error: null }),
    locals.supabase
      .from('article')
      .select(ARTICLE_COLUMNS)
      .eq('article_block.block_type', 'image')
      .order('published_at', { ascending: false })
      .limit(10),
    locals.supabase
      .from('section')
      .select('id, parent_section_id, slug, ordinal, active, created_at')
      .is('parent_section_id', null)
      .eq('active', true)
      .order('ordinal'),
  ]);

  if (slotResult.error) throw error(500, 'Failed to load the front’s slots.');
  if (latestResult.error) throw error(500, 'Failed to load recent articles.');
  if (sectionResult.error) throw error(500, 'Failed to load sections.');

  const slots: FrontSlotRow[] = [];
  for (const row of slotResult.data ?? []) {
    const raw = toOne(row.article as RawArticle | RawArticle[] | null);
    if (raw === null) continue;
    const article = toArticleRow(raw);
    if (article === null) continue;
    slots.push({
      position: row.position,
      layoutVariant: row.layout_variant,
      pinnedUntil: row.pinned_until,
      article,
    });
  }

  // "Latest" is the river beneath the curated front, so anything already hand-placed
  // above is removed rather than shown twice.
  const curatedIds = new Set(slots.map((slot) => slot.article.id));
  const latest = (latestResult.data ?? [])
    .map((row) => toArticleRow(row as RawArticle))
    .filter((article): article is ArticleRow => article !== null)
    .filter((article) => !curatedIds.has(article.id));

  const sections = (sectionResult.data ?? []).map((row) => ({
    id: row.id,
    parentSectionId: row.parent_section_id,
    slug: row.slug,
    ordinal: row.ordinal,
    active: row.active,
    createdAt: row.created_at,
  }));

  const allArticles = [...slots.map((slot) => slot.article), ...latest];

  const [mediaAssets, uiCopy, entityCopy] = await Promise.all([
    loadLeadMediaAssets(locals.supabase, allArticles),
    loadScopedCopy(
      locals.supabase,
      ['content', 'publisher_profile'],
      locals.locale.code,
      locals.defaultLocale.code
    ),
    // By id, not by scope: 'article' is unbounded, so a whole-scope load would ship
    // every headline in the database to render one front.
    loadEntityCopy(
      locals.supabase,
      [
        { scope: 'article', ids: allArticles.map((article) => article.id) },
        { scope: 'article_status', ids: allArticles.map((article) => article.status.id) },
        {
          scope: 'author_profile',
          ids: allArticles.flatMap((article) => article.bylines.map((author) => author.id)),
        },
        {
          scope: 'section',
          ids: [
            ...sections.map((section) => section.id),
            ...allArticles.flatMap((article) => article.sections.map((entry) => entry.id)),
          ],
        },
        {
          scope: 'topic',
          ids: allArticles.flatMap((article) => article.topics.map((entry) => entry.id)),
        },
      ],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ]);

  return {
    slots,
    latest,
    sections,
    storageBaseUrl: STORAGE_BASE_URL,
    mediaAssets,
    localeCode: locals.locale.code,
    copy: [...uiCopy, ...entityCopy],
  };
};

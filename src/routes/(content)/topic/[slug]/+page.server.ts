import { error } from '@sveltejs/kit';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { ArticleRow } from '@sveltebuilder/content/views';
import { ARTICLE_COLUMNS, toArticleRow, toOne, type RawArticle } from '../../../article-rows';
import type { PageServerLoad } from './$types';

// POC ADDITION — the topic page.
//
// ArticleCard hardcodes its topic links to `/?topic=<slug>`, which returned the front
// page and silently ignored the parameter. Rather than teach the front to filter, the
// topic gets a real indexable page and the front redirects that query here — a topic
// is a thing a newsroom wants crawled, not a filter state on the homepage.
//
// Paged like the section screen, and for the same reason: a topic accumulates
// indefinitely, so an unbounded listing is a page that gets slower every week.

const PER_PAGE = 20;

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const pageParam = Number(url.searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const from = (page - 1) * PER_PAGE;

  const topicResult = await locals.supabase
    .from('topic')
    .select('id, slug, active, created_at')
    .eq('slug', params.slug)
    .eq('active', true)
    .maybeSingle();

  if (topicResult.error) throw error(500, 'Failed to load the topic.');
  if (!topicResult.data) throw error(404, 'Topic not found.');

  const topic = {
    id: topicResult.data.id,
    slug: topicResult.data.slug,
    active: topicResult.data.active,
    createdAt: topicResult.data.created_at,
  };

  const [articleResult, topicListResult] = await Promise.all([
    locals.supabase
      .from('article_topic')
      .select(`article!inner(${ARTICLE_COLUMNS})`, { count: 'exact' })
      .eq('topic_id', topic.id)
      .order('published_at', { ascending: false, referencedTable: 'article' })
      .range(from, from + PER_PAGE - 1),
    locals.supabase
      .from('topic')
      .select('id, slug, active, created_at')
      .eq('active', true)
      .order('slug'),
  ]);

  if (articleResult.error) throw error(500, 'Failed to load the topic’s articles.');
  if (topicListResult.error) throw error(500, 'Failed to load topics.');

  const articles: ArticleRow[] = [];
  for (const row of articleResult.data ?? []) {
    const raw = toOne((row as { article: unknown }).article as RawArticle | RawArticle[] | null);
    if (raw === null) continue;
    const article = toArticleRow(raw);
    if (article !== null) articles.push(article);
  }

  const allTopics = (topicListResult.data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    active: row.active,
    createdAt: row.created_at,
  }));

  const [uiCopy, entityCopy] = await Promise.all([
    loadScopedCopy(locals.supabase, ['content'], locals.locale.code, locals.defaultLocale.code),
    loadEntityCopy(
      locals.supabase,
      [
        { scope: 'topic', ids: [topic.id, ...allTopics.map((t) => t.id)] },
        { scope: 'article', ids: articles.map((a) => a.id) },
        { scope: 'article_status', ids: articles.map((a) => a.status.id) },
        { scope: 'author_profile', ids: articles.flatMap((a) => a.bylines.map((b) => b.id)) },
        { scope: 'section', ids: articles.flatMap((a) => a.sections.map((s) => s.id)) },
      ],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ]);

  return {
    topic,
    allTopics,
    articles,
    total: articleResult.count ?? articles.length,
    page,
    perPage: PER_PAGE,
    localeCode: locals.locale.code,
    copy: [...uiCopy, ...entityCopy],
  };
};

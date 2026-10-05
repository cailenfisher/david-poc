import { error } from '@sveltejs/kit';
import { loadEntityCopy, loadScopedCopy } from '$lib/server/scoped-copy';
import type { ArticleRow } from '@sveltebuilder/content/views';
import {
  ARTICLE_COLUMNS,
  STORAGE_BASE_URL,
  loadLeadMediaAssets,
  toArticleRow,
  toOne,
  type RawArticle,
} from '../../../article-rows';
import type { PageServerLoad } from './$types';

// POC ADDITION — the author page.
//
// Two things already pointed here before this route existed, and both 404'd:
// BylineList links every byline to `/author/<slug>` by default, and the NewsArticle
// JSON-LD emits the same path as `author[].url`. Structured data advertising a 404 is
// a quality signal problem on the one thing this module is meant to get right, which
// is why this is the first gap worth closing.
//
// Built here rather than with the module's AuthorProfileView: that component wants the
// pre-resolved ArticleWithCopy family, while every screen in this project passes entity
// rows plus a dictionary. (Its other blocker, passing a `mediaAssets` prop ArticleCard did
// not declare, is fixed in @sveltebuilder/content 1.1.)
//
// No auth guard: the module's RLS decides which articles a reader sees.

export const load: PageServerLoad = async ({ locals, params }) => {
  const authorResult = await locals.supabase
    .from('author_profile')
    .select('id, user_account_id, slug, active, created_at')
    .eq('slug', params.slug)
    .eq('active', true)
    .maybeSingle();

  if (authorResult.error) throw error(500, 'Failed to load the author.');
  if (!authorResult.data) throw error(404, 'Author not found.');

  const author = {
    id: authorResult.data.id,
    userAccountId: authorResult.data.user_account_id,
    slug: authorResult.data.slug,
    active: authorResult.data.active,
    createdAt: authorResult.data.created_at,
  };

  // Reached through the join table because bylines are many-to-many: an article can
  // carry several, and a reporter has many articles. !inner on the embed means an
  // article RLS hides drops the join row rather than returning a null.
  const bylineResult = await locals.supabase
    .from('article_byline')
    .select(`article!inner(${ARTICLE_COLUMNS})`)
    .eq('author_profile_id', author.id)
    // Image blocks only: a card needs its picture, not the body. See ARTICLE_COLUMNS.
    .eq('article.article_block.block_type', 'image')
    .order('published_at', { ascending: false, referencedTable: 'article' });

  if (bylineResult.error) throw error(500, 'Failed to load the author’s articles.');

  const articles: ArticleRow[] = [];
  for (const row of bylineResult.data ?? []) {
    const raw = toOne((row as { article: unknown }).article as RawArticle | RawArticle[] | null);
    if (raw === null) continue;
    const article = toArticleRow(raw);
    if (article !== null) articles.push(article);
  }

  const [mediaAssets, uiCopy, entityCopy] = await Promise.all([
    loadLeadMediaAssets(locals.supabase, articles),
    loadScopedCopy(locals.supabase, ['content'], locals.locale.code, locals.defaultLocale.code),
    loadEntityCopy(
      locals.supabase,
      [
        { scope: 'author_profile', ids: [author.id] },
        { scope: 'article', ids: articles.map((a) => a.id) },
        { scope: 'article_status', ids: articles.map((a) => a.status.id) },
        {
          scope: 'section',
          ids: articles.flatMap((a) => a.sections.map((s) => s.id)),
        },
        { scope: 'topic', ids: articles.flatMap((a) => a.topics.map((t) => t.id)) },
      ],
      locals.locale.code,
      locals.defaultLocale.code
    ),
  ]);

  return {
    author,
    articles,
    storageBaseUrl: STORAGE_BASE_URL,
    mediaAssets,
    localeCode: locals.locale.code,
    copy: [...uiCopy, ...entityCopy],
  };
};

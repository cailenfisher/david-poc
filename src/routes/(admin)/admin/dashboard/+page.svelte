<script lang="ts">
  import { createDictionary } from 'diglossia'
  import { getDictionary } from 'diglossia/svelte'
  import type { PageData } from './$types'
  import ActiveArticleItem from '$lib/components/ActiveArticleItem.svelte'
  import ArticleStatusSummary from '$lib/components/ArticleStatusSummary.svelte'
  import DashboardList from '$lib/components/DashboardList.svelte'
  import DashboardWidget from '$lib/components/DashboardWidget.svelte'
  import FigureList from '$lib/components/FigureList.svelte'
  import PageViewWidget from '$lib/components/PageViewWidget.svelte'
  import TrendingArticleItem from '$lib/components/TrendingArticleItem.svelte'
  import { toPageViewChartPoints } from '$lib/utils/format-page-view'

  let { data }: { data: PageData } = $props()

  const dictionary = getDictionary()

  // A fresh instance from this screen's payload rather than merging into the layout's
  // dictionary — see the note in (content)/article/[slug]/+page.svelte.
  const scoped = $derived(createDictionary(data.copy))
  const t = (slug: string) => scoped.localText(slug, 'dashboard')
  const pageViewText = (slug: string) => scoped.localText(slug, 'page_view')

  const numberFormat = $derived(new Intl.NumberFormat(data.localeCode))

  // Archived stories are out of circulation; the pipeline is the stages work moves through.
  const pipeline = $derived(
    (data.articleStatusCount ?? []).filter((entry) => entry.status.slug !== 'archived')
  )
</script>

<svelte:head>
  <title>{dictionary.localText('admin.dashboard.title')}</title>
</svelte:head>

<div class="dashboard">
  <header class="dashboard__header">
    <h1 class="dashboard__title">{dictionary.localText('admin.dashboard.title')}</h1>
  </header>

  {#if data.pageView}
    <PageViewWidget
      title={pageViewText('page_view.widget_title')}
      viewCountLabel={pageViewText('page_view.view_count')}
      viewCountText={numberFormat.format(data.pageView.viewCount)}
      visitorCountLabel={pageViewText('page_view.visitor_count')}
      visitorCountText={numberFormat.format(data.pageView.visitorCount)}
      points={toPageViewChartPoints(data.pageView.daily, data.localeCode)}
      chartTitle={pageViewText('page_view.daily_title')}
      dayHeader={pageViewText('page_view.day')}
      reportHref="/admin/page-view"
      reportLabel={pageViewText('page_view.view_report')}
    />
  {/if}

  <div class="dashboard__row dashboard__row--summary">
    {#if data.articleStatusCount}
      <DashboardWidget
        title={t('dashboard.pipeline.title')}
        href="/admin/content/board"
        linkLabel={t('dashboard.pipeline.open')}
      >
        <ArticleStatusSummary
          statusCount={pipeline}
          localeCode={data.localeCode}
          dictionary={scoped}
        />
      </DashboardWidget>
    {/if}

    {#if data.commentQueue}
      <DashboardWidget
        title={t('dashboard.comment.title')}
        href="/admin/content/comment"
        linkLabel={t('dashboard.comment.open')}
      >
        <FigureList
          figures={[
            {
              label: t('dashboard.comment.pending'),
              valueText: numberFormat.format(data.commentQueue.pendingCount),
              attention: data.commentQueue.pendingCount > 0,
            },
            {
              label: t('dashboard.comment.flagged'),
              valueText: numberFormat.format(data.commentQueue.flaggedCount),
              attention: data.commentQueue.flaggedCount > 0,
            },
          ]}
        />
      </DashboardWidget>
    {/if}
  </div>

  <div class="dashboard__row">
    {#if data.activeArticle}
      <DashboardWidget
        title={t('dashboard.active.title')}
        href="/admin/content/article"
        linkLabel={t('dashboard.active.open')}
      >
        <DashboardList items={data.activeArticle} emptyLabel={t('dashboard.active.empty')}>
          {#snippet item(article)}
            <ActiveArticleItem
              {article}
              localeCode={data.localeCode}
              dueLabel={t('dashboard.active.due')}
              overdueLabel={t('dashboard.active.overdue')}
              embargoedLabel={t('dashboard.active.embargoed')}
              dictionary={scoped}
            />
          {/snippet}
        </DashboardList>
      </DashboardWidget>
    {/if}

    {#if data.trendingArticle}
      <DashboardWidget
        title={t('dashboard.trending.title')}
        caption={t('dashboard.trending.caption')}
        href="/admin/page-view"
        linkLabel={t('dashboard.trending.open')}
      >
        <DashboardList
          items={data.trendingArticle}
          emptyLabel={t('dashboard.trending.empty')}
          ordered
        >
          {#snippet item(article, index)}
            <TrendingArticleItem
              {article}
              rank={index + 1}
              localeCode={data.localeCode}
              viewCountLabel={pageViewText('page_view.view_count')}
              dictionary={scoped}
            />
          {/snippet}
        </DashboardList>
      </DashboardWidget>
    {/if}
  </div>
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .dashboard__header {
    display: flex;
    align-items: baseline;
  }

  .dashboard__title {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0;
    line-height: 1.25;
  }

  /* Two rows, so widgets of a kind sit side by side at matching heights: the
     summary figures first, then the story lists. */
  .dashboard__row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 1rem;
  }

  /* The pipeline has a figure per status; the comment queue has two. */
  @media (min-width: 64rem) {
    .dashboard__row--summary {
      grid-template-columns: 2fr 1fr;
    }
  }
</style>

<script lang="ts">
  import { createDictionary } from 'diglossia'
  import {
    InlineNotification,
    MetricCard,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '@sveltebuilder/coreui'
  import PageViewChart from '$lib/components/PageViewChart.svelte'
  import { toPageViewChartPoints } from '$lib/utils/format-page-view'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const scoped = $derived(createDictionary(data.copy))
  const t = (slug: string) => scoped.localText(slug, 'page_view')
  const windowLabel = (days: number) => scoped.formatText('page_view.window_days', { days }, 'page_view')

  const numberFormat = $derived(new Intl.NumberFormat(data.localeCode))
  const ratioFormat = $derived(new Intl.NumberFormat(data.localeCode, { maximumFractionDigits: 1 }))

  const report = $derived(data.report)
  const points = $derived(toPageViewChartPoints(report.daily, data.localeCode))
  const peak = $derived(Math.max(0, ...report.daily.map((row) => row.viewCount)))
  const viewsPerVisitor = $derived(
    report.visitorCount > 0 ? ratioFormat.format(report.viewCount / report.visitorCount) : '—'
  )
</script>

<svelte:head>
  <title>{t('page_view.title')}</title>
</svelte:head>

<div class="page-view">
  <header class="page-view__header">
    <h1 class="page-view__title">{t('page_view.title')}</h1>

    <nav class="page-view__windows" aria-label={t('page_view.window')}>
      {#each data.windows as days (days)}
        <a
          href="?days={days}"
          class="page-view__window"
          aria-current={days === report.days ? 'page' : undefined}
        >
          {windowLabel(days)}
        </a>
      {/each}
    </nav>
  </header>

  <InlineNotification severity="info" summary={t('page_view.privacy_hint')} />

  <section class="page-view__metrics" aria-label={windowLabel(report.days)}>
    <MetricCard label={t('page_view.view_count')} value={numberFormat.format(report.viewCount)} />
    <MetricCard label={t('page_view.visitor_count')} value={numberFormat.format(report.visitorCount)} />
    <MetricCard label={t('page_view.views_per_visitor')} value={viewsPerVisitor} />
  </section>

  <section class="page-view__section">
    <h2 class="page-view__section-title">{t('page_view.daily_title')}</h2>
    <PageViewChart
      {points}
      title={t('page_view.daily_title')}
      labelHeader={t('page_view.day')}
      valueHeader={t('page_view.view_count')}
      maxText={numberFormat.format(peak)}
      tableToggleLabel={t('page_view.show_data')}
    />
  </section>

  <div class="page-view__breakdowns">
    <section class="page-view__section">
      <h2 class="page-view__section-title">{t('page_view.top_path')}</h2>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t('page_view.path')}</TableHeader>
            <TableHeader>{t('page_view.view_count')}</TableHeader>
            <TableHeader>{t('page_view.visitor_count')}</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {#each report.topPath as row (row.path)}
            <TableRow>
              <TableCell><a href={row.path} class="page-view__path">{row.path}</a></TableCell>
              <TableCell>{numberFormat.format(row.viewCount)}</TableCell>
              <TableCell>{numberFormat.format(row.visitorCount)}</TableCell>
            </TableRow>
          {:else}
            <TableRow>
              <TableCell colspan={3}><p class="page-view__empty">{t('page_view.empty')}</p></TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </section>

    <section class="page-view__section">
      <h2 class="page-view__section-title">{t('page_view.top_referrer')}</h2>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t('page_view.referrer')}</TableHeader>
            <TableHeader>{t('page_view.view_count')}</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {#each report.topReferrer as row (row.referrerHost)}
            <TableRow>
              <TableCell>{row.referrerHost ?? t('page_view.direct')}</TableCell>
              <TableCell>{numberFormat.format(row.viewCount)}</TableCell>
            </TableRow>
          {:else}
            <TableRow>
              <TableCell colspan={2}><p class="page-view__empty">{t('page_view.empty')}</p></TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </section>
  </div>
</div>

<style>
  .page-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 72rem;
  }

  .page-view__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .page-view__title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .page-view__windows {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
  }

  .page-view__window {
    padding: 0.375rem 0.75rem;
    border-radius: var(--radius);
    font-size: 0.875rem;
    text-decoration: none;
    color: var(--text-soft, inherit);
  }

  .page-view__window:hover {
    background-color: var(--surface-overlay);
  }

  .page-view__window:focus-visible {
    outline: 2px solid var(--brand, currentColor);
    outline-offset: 2px;
  }

  /* Selection is shown by weight and fill, not color alone. */
  .page-view__window[aria-current='page'] {
    font-weight: 600;
    color: var(--text, inherit);
    background-color: var(--brand-soft);
  }

  .page-view__metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: 1rem;
  }

  .page-view__breakdowns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
    gap: 1.5rem;
    align-items: start;
  }

  .page-view__section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .page-view__section-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .page-view__path {
    font-family: var(--font-mono, monospace);
    font-size: 0.8125rem;
    word-break: break-all;
  }

  .page-view__empty {
    margin: 0;
    padding: 1rem 0;
    text-align: center;
    font-size: 0.875rem;
    color: var(--text-soft, inherit);
  }
</style>

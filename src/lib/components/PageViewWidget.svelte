<!--
  Dashboard widget: headline visitor numbers plus a small daily chart, linking to
  the full report. A UI component — labels and values arrive formatted.
-->
<script lang="ts">
  import { Card } from '@sveltebuilder/coreui'
  import PageViewChart from './PageViewChart.svelte'

  type Props = {
    title: string
    viewCountLabel: string
    viewCountText: string
    visitorCountLabel: string
    visitorCountText: string
    points: { label: string; value: number; valueText: string }[]
    chartTitle: string
    dayHeader: string
    reportHref: string
    reportLabel: string
  }

  let {
    title,
    viewCountLabel,
    viewCountText,
    visitorCountLabel,
    visitorCountText,
    points,
    chartTitle,
    dayHeader,
    reportHref,
    reportLabel,
  }: Props = $props()
</script>

<Card as="article">
  <div class="page-view-widget">
    <header class="page-view-widget__header">
      <h2 class="page-view-widget__title">{title}</h2>
      <a class="page-view-widget__link" href={reportHref}>{reportLabel} →</a>
    </header>

    <dl class="page-view-widget__figures">
      <div>
        <dt>{viewCountLabel}</dt>
        <dd>{viewCountText}</dd>
      </div>
      <div>
        <dt>{visitorCountLabel}</dt>
        <dd>{visitorCountText}</dd>
      </div>
    </dl>

    <PageViewChart
      {points}
      title={chartTitle}
      labelHeader={dayHeader}
      valueHeader={viewCountLabel}
      height="4.5rem"
    />
  </div>
</Card>

<style>
  .page-view-widget {
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 1rem);
  }

  .page-view-widget__header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2, 0.5rem);
  }

  .page-view-widget__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .page-view-widget__link {
    font-size: var(--text-sm, 0.875rem);
  }

  .page-view-widget__figures {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8, 2rem);
    margin: 0;
  }

  .page-view-widget__figures dt {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-soft, inherit);
  }

  .page-view-widget__figures dd {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
</style>

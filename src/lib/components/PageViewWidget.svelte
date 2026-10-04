<!--
  Dashboard widget: headline visitor numbers plus a small daily chart, linking to
  the full report. A UI component — labels and values arrive formatted.
-->
<script lang="ts">
  import DashboardWidget from './DashboardWidget.svelte'
  import FigureList from './FigureList.svelte'
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

<DashboardWidget {title} href={reportHref} linkLabel={reportLabel}>
  <FigureList
    figures={[
      { label: viewCountLabel, valueText: viewCountText },
      { label: visitorCountLabel, valueText: visitorCountText },
    ]}
  />

  <PageViewChart
    {points}
    title={chartTitle}
    labelHeader={dayHeader}
    valueHeader={viewCountLabel}
    height="4.5rem"
  />
</DashboardWidget>

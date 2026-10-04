<!--
  Single-series column chart for a daily count. A UI component: every label arrives
  as a plain, already-formatted string, so it knows nothing about locales.

  Screen readers get the data table; the bars are presentation only. Hover or
  focus a column for its exact value.
-->
<script lang="ts">
  type Point = {
    /** Short axis label, e.g. "Oct 3". */
    label: string;
    value: number;
    /** Formatted value for tooltips and the table, e.g. "1,204". */
    valueText: string;
  };

  type Props = {
    points: Point[];
    /** Names the chart, e.g. "Page views per day". Used as the table caption. */
    title: string;
    /** Column headers for the accessible table. */
    labelHeader: string;
    valueHeader: string;
    /** Formatted maximum for the top gridline. Defaults to the raw number. */
    maxText?: string;
    /**
     * When given, the data table becomes a visible disclosure with this summary,
     * e.g. "Show data". Otherwise it is available to assistive technology only.
     */
    tableToggleLabel?: string;
    height?: string;
  };

  let {
    points,
    title,
    labelHeader,
    valueHeader,
    maxText,
    tableToggleLabel,
    height = '10rem',
  }: Props = $props();

  const max = $derived(Math.max(1, ...points.map((point) => point.value)));
</script>

<figure class="page-view-chart">
  <div class="page-view-chart__plot" style:height aria-hidden="true">
    <span class="page-view-chart__gridline page-view-chart__gridline--top">
      <span class="page-view-chart__tick">{maxText ?? max}</span>
    </span>
    <span class="page-view-chart__gridline page-view-chart__gridline--base"></span>
    <ol class="page-view-chart__columns">
      {#each points as point, index (index)}
        <li class="page-view-chart__column">
          <span
            class="page-view-chart__bar"
            class:page-view-chart__bar--zero={point.value === 0}
            style:height="{(point.value / max) * 100}%"
          ></span>
          <span class="page-view-chart__tooltip">
            <strong>{point.valueText}</strong>
            {point.label}
          </span>
        </li>
      {/each}
    </ol>
  </div>

  {#if points.length > 0}
    <div class="page-view-chart__axis" aria-hidden="true">
      <span>{points[0].label}</span>
      <span>{points[points.length - 1].label}</span>
    </div>
  {/if}

  {#snippet dataTable(hidden: boolean)}
    <table class="page-view-chart__table" class:page-view-chart__table--hidden={hidden}>
      <caption>{title}</caption>
      <thead>
        <tr><th scope="col">{labelHeader}</th><th scope="col">{valueHeader}</th></tr>
      </thead>
      <tbody>
        {#each points as point, index (index)}
          <tr><th scope="row">{point.label}</th><td>{point.valueText}</td></tr>
        {/each}
      </tbody>
    </table>
  {/snippet}

  {#if tableToggleLabel}
    <details class="page-view-chart__details">
      <summary>{tableToggleLabel}</summary>
      {@render dataTable(false)}
    </details>
  {:else}
    {@render dataTable(true)}
  {/if}
</figure>

<style>
  .page-view-chart {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 0.5rem);
  }

  .page-view-chart__plot {
    position: relative;
  }

  .page-view-chart__gridline {
    position: absolute;
    inset-inline: 0;
    border-top: 1px solid var(--border, rgba(0, 0, 0, 0.1));
  }

  .page-view-chart__gridline--top {
    top: 0;
    border-top-style: dashed;
  }

  .page-view-chart__gridline--base {
    bottom: 0;
  }

  .page-view-chart__tick {
    position: absolute;
    inset-inline-end: 0;
    bottom: 0.125rem;
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, inherit);
    font-variant-numeric: tabular-nums;
  }

  .page-view-chart__columns {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    align-items: flex-end;
    /* 2px surface gap between adjacent bars. */
    gap: 2px;
  }

  .page-view-chart__column {
    position: relative;
    flex: 1;
    height: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .page-view-chart__bar {
    width: 100%;
    max-width: 2.5rem;
    background-color: var(--brand, #45b1e8);
    border-radius: 4px 4px 0 0;
    transition: opacity 0.12s;
  }

  /* A zero day still shows a hairline, so an empty day reads as "none" not "missing". */
  .page-view-chart__bar--zero {
    height: 2px !important;
    background-color: var(--border-strong, rgba(0, 0, 0, 0.2));
  }

  .page-view-chart__columns:hover .page-view-chart__bar {
    opacity: 0.45;
  }

  .page-view-chart__columns:hover .page-view-chart__column:hover .page-view-chart__bar {
    opacity: 1;
  }

  .page-view-chart__tooltip {
    position: absolute;
    bottom: calc(100% + 0.25rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1;
    display: none;
    flex-direction: column;
    align-items: center;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    white-space: nowrap;
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-invert, #fff);
    background-color: var(--surface-invert, #111);
    pointer-events: none;
  }

  .page-view-chart__tooltip strong {
    font-variant-numeric: tabular-nums;
  }

  .page-view-chart__column:hover .page-view-chart__tooltip {
    display: flex;
  }

  .page-view-chart__axis {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, inherit);
  }

  .page-view-chart__details summary {
    cursor: pointer;
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-soft, inherit);
  }

  .page-view-chart__table {
    margin-top: var(--space-2, 0.5rem);
    border-collapse: collapse;
    font-size: var(--text-sm, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  .page-view-chart__table caption {
    text-align: start;
    font-weight: 600;
  }

  .page-view-chart__table th,
  .page-view-chart__table td {
    padding: 0.25rem 1rem 0.25rem 0;
    text-align: start;
    border-bottom: 1px solid var(--border, rgba(0, 0, 0, 0.1));
  }

  .page-view-chart__table th[scope='row'] {
    font-weight: 400;
  }

  /* Visually hidden, still read by assistive technology. */
  .page-view-chart__table--hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>

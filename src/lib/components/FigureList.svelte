<!--
  A row of headline numbers, each a label over a large value. A UI component — values
  arrive already formatted for the viewer's locale.

  A figure with an `href` makes its value a link to the screen behind the number.
  `attention` draws the eye to a figure that wants action; the label must still say
  what it is, since emphasis is never the only signal.
-->
<script lang="ts">
  type Figure = {
    label: string
    valueText: string
    href?: string
    attention?: boolean
  }

  type Props = {
    figures: Figure[]
  }

  let { figures }: Props = $props()
</script>

<dl class="figure-list">
  {#each figures as figure, index (index)}
    <div class="figure-list__figure" class:figure-list__figure--attention={figure.attention}>
      <dt class="figure-list__label">{figure.label}</dt>
      <dd class="figure-list__value">
        {#if figure.href}
          <a class="figure-list__link" href={figure.href}>{figure.valueText}</a>
        {:else}
          {figure.valueText}
        {/if}
      </dd>
    </div>
  {/each}
</dl>

<style>
  .figure-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4, 1rem) var(--space-8, 2rem);
    margin: 0;
  }

  .figure-list__figure {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .figure-list__label {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-soft, inherit);
  }

  .figure-list__value {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .figure-list__link {
    color: inherit;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
  }

  .figure-list__figure--attention .figure-list__value {
    color: var(--danger-text);
  }
</style>

<!--
  A short list inside a dashboard widget, or a line saying it is empty. A UI
  component: the caller renders each entry's `<li>` through the `item` snippet, so
  entity rows can resolve their own copy.
-->
<script lang="ts" generics="Item">
  import type { Snippet } from 'svelte'

  type Props = {
    items: Item[]
    item: Snippet<[Item, number]>
    emptyLabel: string
    /** A ranking reads as `<ol>`; anything else as `<ul>`. */
    ordered?: boolean
  }

  let { items, item, emptyLabel, ordered = false }: Props = $props()
</script>

{#if items.length === 0}
  <p class="dashboard-list__empty">{emptyLabel}</p>
{:else}
  <svelte:element this={ordered ? 'ol' : 'ul'} class="dashboard-list">
    {#each items as entry, index (index)}
      {@render item(entry, index)}
    {/each}
  </svelte:element>
{/if}

<style>
  .dashboard-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dashboard-list > :global(li + li) {
    border-top: var(--border);
  }

  .dashboard-list__empty {
    margin: 0;
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-soft, inherit);
  }
</style>

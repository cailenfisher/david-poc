<!--
  The frame every admin dashboard widget shares: a titled card with an optional link
  to the screen it summarizes. A UI component — labels arrive as plain strings.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Card } from '@sveltebuilder/coreui'

  type Props = {
    title: string
    /** The full screen this widget summarizes. Shown only with `linkLabel`. */
    href?: string
    linkLabel?: string
    /** A short line under the title saying how to read the widget. */
    caption?: string
    children: Snippet
  }

  let { title, href, linkLabel, caption, children }: Props = $props()
</script>

<Card as="article">
  <div class="dashboard-widget">
    <header class="dashboard-widget__header">
      <div class="dashboard-widget__heading">
        <h2 class="dashboard-widget__title">{title}</h2>
        {#if caption}
          <p class="dashboard-widget__caption">{caption}</p>
        {/if}
      </div>
      {#if href && linkLabel}
        <a class="dashboard-widget__link" {href}>{linkLabel} →</a>
      {/if}
    </header>

    {@render children()}
  </div>
</Card>

<style>
  .dashboard-widget {
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 1rem);
  }

  .dashboard-widget__header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2, 0.5rem);
  }

  .dashboard-widget__heading {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .dashboard-widget__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .dashboard-widget__caption {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-soft, inherit);
  }

  /* --link-text rather than the browser default, whose blue and visited purple are
     unreadable on the dark theme's card surface. */
  .dashboard-widget__link {
    font-size: var(--text-sm, 0.875rem);
    color: var(--link-text);
    text-underline-offset: 0.2em;
  }
</style>

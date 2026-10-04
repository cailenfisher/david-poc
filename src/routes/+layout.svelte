<script lang="ts">
  import '../app.css'
  import { page } from '$app/state'
  import { afterNavigate } from '$app/navigation'
  import { createDictionary } from 'diglossia'
  import { setDictionary, getDictionary, LocalText } from 'diglossia/svelte'
  import {
    LocaleSwitcher,
    createMessageBus,
    setMessageBus,
    ToastRegion,
    MessageAriaLive,
  } from '@sveltebuilder/coreui'
  import type { LayoutData } from './$types'
  import { sendPageView } from '$lib/utils/page-view-beacon'

  let { data, children }: { data: LayoutData; children: any } = $props()

  // Not inside $effect: effects don't run during SSR, so a dictionary built in
  // one would leave every server-rendered page showing [missing: …] sentinels.
  setDictionary(createDictionary(data.dictionary))
  const dictionary = getDictionary()

  // Same reasoning as the dictionary: a module-level message bus would leak
  // one visitor's toasts/banners into another's response on the server.
  setMessageBus(createMessageBus())

  // Visitor analytics. Client-only by nature: afterNavigate never runs during SSR.
  afterNavigate(sendPageView)

  // Admin and auth routes manage their own chrome.
  const fullPage = $derived(
    page.url.pathname.startsWith('/admin') ||
    page.url.pathname.startsWith('/sign-')
  )
</script>

<svelte:head>
  <title>{dictionary.localText('app.name')}</title>
</svelte:head>

{#if fullPage}
  <div dir={data.locale.dir} class="full-page">
    {@render children()}
  </div>
{:else}
  <div class="app" dir={data.locale.dir}>
    <header class="app__header">
      <a href="/" class="app__brand">
        <LocalText slug="app.name" />
      </a>
      <nav class="app__nav">
        <LocaleSwitcher
          label={dictionary.localText('locale.select')}
          current={data.locale}
          locales={data.locales}
        />
      </nav>
    </header>

    <main class="app__main">
      {@render children()}
    </main>

    <footer class="app__footer">
      <p class="app__footer-copy">
        <LocalText slug="app.name" />
      </p>
    </footer>
  </div>
{/if}

<ToastRegion />
<MessageAriaLive />

<style>
  .full-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .app {
    display: grid;
    grid-template-rows: auto 1fr auto;
    min-height: 100dvh;
  }

  .app__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--border-color);
  }

  .app__brand {
    font-weight: 600;
    text-decoration: none;
    color: var(--text);
  }

  .app__nav {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .app__main {
    padding: 1.5rem;
  }

  .app__footer {
    padding: 0.75rem 1.5rem;
    border-top: 1px solid var(--border-color);
  }

  .app__footer-copy {
    margin: 0;
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-soft);
  }
</style>

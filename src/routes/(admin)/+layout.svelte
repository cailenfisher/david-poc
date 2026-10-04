<script lang="ts">
  import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
  import '@fortawesome/fontawesome-free/css/solid.min.css'
  import type { Snippet } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import { Avatar, Button } from '@sveltebuilder/coreui'
  import { getDictionary } from 'diglossia/svelte'
  import type { LayoutData } from './$types'
  import {
    APPLICATION_SETTINGS_ICON,
    applicationSetting,
    currentFor,
    iconFor,
  } from './admin-navigation'

  let { data, children }: { data: LayoutData; children: Snippet } = $props()

  const dictionary = getDictionary()

  const navLinks = $derived(
    data.navItems.map((item) => ({
      href: item.href,
      label: item.localTextLink ? dictionary.localText(item.localTextLink.slug) : item.href,
      icon: iconFor(item.href),
      current: currentFor(item.href, page.url.pathname),
    }))
  )

  const newsroomLinks = $derived(navLinks.filter((link) => !applicationSetting(link.href)))
  const settingsLinks = $derived(navLinks.filter((link) => applicationSetting(link.href)))

  // Collapsed by default, except when the page being shown lives inside the group —
  // hiding the current page's own link would leave the operator with no sense of
  // where they are. Writable derived: the toggle overrides it until the next
  // navigation recomputes it.
  let settingsExpanded = $derived(settingsLinks.some((link) => link.current))

  // The fallback is used during SSR only; CSS media queries decide what is drawn, so
  // the server-rendered HTML already matches the viewport.
  const wideScreen = new MediaQuery('min-width: 64rem', true)

  // null follows the screen size; a boolean is the operator's explicit choice.
  let navigationChoice = $state<boolean | null>(null)
  const navigationExpanded = $derived(navigationChoice ?? wideScreen.current)
  const navigationOverlay = $derived(navigationExpanded && !wideScreen.current)

  let navigationElement = $state<HTMLElement>()
  let toggleButton = $state<HTMLButtonElement>()

  function closeOverlay() {
    if (navigationOverlay) navigationChoice = null
  }

  afterNavigate(closeOverlay)

  function handleNavigationKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !navigationOverlay) return
    navigationChoice = null
    toggleButton?.focus()
  }

  function handleNavigationFocusout(event: FocusEvent) {
    const next = event.relatedTarget
    if (next instanceof Node && navigationElement?.contains(next)) return
    closeOverlay()
  }
</script>

{#snippet navLink(link: { href: string; label: string; icon: string; current: boolean })}
  <a
    href={link.href}
    class="admin-layout__nav-link"
    class:admin-layout__nav-link--current={link.current}
    aria-current={link.current ? 'page' : undefined}
  >
    <i class="{link.icon} admin-layout__icon" aria-hidden="true"></i>
    <span class="admin-layout__label">{link.label}</span>
  </a>
{/snippet}

<div
  class="admin-layout"
  data-navigation={navigationChoice === null ? 'auto' : navigationChoice ? 'expanded' : 'collapsed'}
>
  <!-- Escape and focus-out are the keyboard paths for closing the overlay, so the
       key and focus handlers on the landmark are intentional. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <nav
    bind:this={navigationElement}
    class="admin-layout__sidebar"
    class:admin-layout__sidebar--overlay={navigationOverlay}
    aria-label={dictionary.localText('admin.nav.label')}
    onkeydown={handleNavigationKeydown}
    onfocusout={handleNavigationFocusout}
  >
    <button
      bind:this={toggleButton}
      type="button"
      class="admin-layout__nav-link admin-layout__toggle"
      aria-expanded={navigationExpanded}
      aria-controls="admin-navigation-list"
      aria-label={dictionary.localText('admin.nav.toggle')}
      onclick={() => (navigationChoice = !navigationExpanded)}
    >
      <i class="fa-solid fa-bars admin-layout__icon" aria-hidden="true"></i>
    </button>
    <ul id="admin-navigation-list" class="admin-layout__nav">
      {#each newsroomLinks as link (link.href)}
        <li>
          {@render navLink(link)}
        </li>
      {/each}

      {#if settingsLinks.length > 0}
        <li class="admin-layout__group">
          <button
            type="button"
            class="admin-layout__nav-link admin-layout__group-toggle"
            aria-expanded={settingsExpanded}
            aria-controls="admin-nav-application-settings"
            onclick={() => (settingsExpanded = !settingsExpanded)}
          >
            <i class="{APPLICATION_SETTINGS_ICON} admin-layout__icon" aria-hidden="true"></i>
            <span class="admin-layout__label">
              {dictionary.localText('admin.nav.application_settings')}
            </span>
            <i class="fa-solid fa-chevron-down admin-layout__chevron" aria-hidden="true"></i>
          </button>
          <ul
            id="admin-nav-application-settings"
            class="admin-layout__nav admin-layout__nav--nested"
            hidden={!settingsExpanded}
          >
            {#each settingsLinks as link (link.href)}
              <li>
                {@render navLink(link)}
              </li>
            {/each}
          </ul>
        </li>
      {/if}
    </ul>
  </nav>

  {#if navigationOverlay}
    <!-- Pointer-only affordance: keyboard users close the overlay with Escape or by
         moving focus out of the navigation. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="admin-layout__scrim" aria-hidden="true" onclick={closeOverlay}></div>
  {/if}

  <div class="admin-layout__body">
    <header class="admin-layout__header">
      <a href="/admin/dashboard" class="admin-layout__title">{dictionary.localText('admin.title')}</a>
      <div class="admin-layout__user">
        <Avatar
          fallback={data.user?.email?.charAt(0)?.toUpperCase() ?? '?'}
          alt={data.user?.email ?? ''}
          size="sm"
        />
        <span class="admin-layout__email">{data.user?.email}</span>
        <form method="post" action="/sign-out">
          <Button type="submit" variant="ghost" size="sm">
            {dictionary.localText('user.sign_out')}
          </Button>
        </form>
      </div>
    </header>

    <main class="admin-layout__main">
      {@render children()}
    </main>
  </div>
</div>

<style>
  .admin-layout {
    --navigation-rail-width: 3.75rem;
    --navigation-full-width: 14rem;
    /* What the nav draws, and what the layout reserves for it. */
    --navigation-width: var(--navigation-rail-width);
    --navigation-track: var(--navigation-rail-width);
    --navigation-nested-indent: 0rem;
    display: grid;
    grid-template-columns: var(--navigation-track) minmax(0, 1fr);
    flex: 1;
    min-height: 100dvh;
  }

  .admin-layout[data-navigation='expanded'] {
    --navigation-width: var(--navigation-full-width);
    --navigation-nested-indent: 1rem;
  }

  @media (width >= 64rem) {
    .admin-layout[data-navigation='auto'] {
      --navigation-width: var(--navigation-full-width);
      --navigation-nested-indent: 1rem;
    }

    /* Wide screens reserve whatever the nav draws; narrow ones always reserve the
       rail, so an expanded nav overlays the content instead of squeezing it. */
    .admin-layout {
      --navigation-track: var(--navigation-width);
    }
  }

  .admin-layout__sidebar {
    position: sticky;
    inset-block-start: 0;
    z-index: 20;
    align-self: start;
    inline-size: var(--navigation-width);
    block-size: 100dvh;
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 0.75rem 0.5rem;
    border-inline-end: 1px solid var(--border-color);
    background-color: var(--surface-raised);
  }

  .admin-layout__sidebar--overlay {
    box-shadow: var(--shadow-lg);
  }

  .admin-layout__scrim {
    position: fixed;
    inset-block: 0;
    inset-inline: var(--navigation-rail-width) 0;
    z-index: 10;
    background-color: rgb(0 0 0 / 0.3);
  }

  .admin-layout__title {
    font-weight: 600;
    font-size: 1rem;
    text-decoration: none;
    color: inherit;
  }

  .admin-layout__nav {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .admin-layout__nav--nested {
    margin-top: 0.125rem;
    padding-inline-start: var(--navigation-nested-indent);
  }

  .admin-layout__nav--nested[hidden] {
    display: none;
  }

  .admin-layout__nav-link {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    overflow: hidden;
    white-space: nowrap;
    border: 0;
    border-radius: var(--radius);
    background: none;
    font: inherit;
    font-size: 0.875rem;
    text-align: start;
    text-decoration: none;
    color: var(--text);
    cursor: pointer;
    transition: background-color 0.12s;
  }

  .admin-layout__nav-link:hover {
    background-color: var(--surface-overlay);
  }

  .admin-layout__nav-link:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }

  /* Weight as well as background, so the current page is not marked by colour alone. */
  .admin-layout__nav-link--current {
    font-weight: 600;
    background-color: var(--surface-overlay);
  }

  .admin-layout__icon {
    width: 1.5rem;
    flex-shrink: 0;
    text-align: center;
    color: var(--text-soft);
  }

  .admin-layout__label {
    flex: 1;
  }

  .admin-layout__chevron {
    font-size: 0.75em;
    transition: transform 0.15s;
  }

  .admin-layout__group-toggle[aria-expanded='true'] .admin-layout__chevron {
    transform: rotate(180deg);
  }

  @media (pointer: coarse) {
    .admin-layout__nav-link {
      min-block-size: 2.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .admin-layout__nav-link,
    .admin-layout__chevron {
      transition: none;
    }
  }

  .admin-layout__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .admin-layout__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.625rem 1.25rem;
    border-bottom: 1px solid var(--border-color);
    min-height: 3.25rem;
  }

  .admin-layout__user {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .admin-layout__email {
    font-size: 0.875rem;
    color: var(--text-soft);
  }

  .admin-layout__main {
    padding: 1rem;
    flex: 1;
  }

  @media (width >= 48rem) {
    .admin-layout__main {
      padding: 1.5rem;
    }
  }

  @media (width < 48rem) {
    .admin-layout__header {
      padding-inline: 1rem;
    }

    .admin-layout__email {
      display: none;
    }
  }
</style>

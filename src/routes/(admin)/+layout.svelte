<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Avatar, Button } from '@sveltebuilder/coreui'
  import { getDictionary } from 'diglossia/svelte'
  import type { LayoutData } from './$types'

  let { data, children }: { data: LayoutData; children: Snippet } = $props()

  const dictionary = getDictionary()

  const navLinks = $derived(
    data.navItems.map((item) => ({
      href: item.href,
      label: item.localTextLink ? dictionary.localText(item.localTextLink.slug) : item.href,
    }))
  )
</script>

<div class="admin-layout">
  <nav class="admin-layout__sidebar" aria-label={dictionary.localText('admin.nav.label')}>
    <div class="admin-layout__logo">
      <a href="/admin/dashboard">{dictionary.localText('admin.title')}</a>
    </div>
    <ul class="admin-layout__nav">
      {#each navLinks as link}
        <li>
          <a href={link.href} class="admin-layout__nav-link">{link.label}</a>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="admin-layout__body">
    <header class="admin-layout__header">
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
    display: flex;
    flex: 1;
    min-height: 100dvh;
  }

  .admin-layout__sidebar {
    width: 224px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.25rem 0.75rem;
    border-right: 1px solid var(--color-border-default, currentColor);
    background-color: var(--color-surface-raised, transparent);
  }

  .admin-layout__logo a {
    font-weight: 600;
    font-size: 1rem;
    text-decoration: none;
    color: inherit;
    padding: 0 0.5rem;
  }

  .admin-layout__nav {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .admin-layout__nav-link {
    display: block;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    text-decoration: none;
    font-size: 0.875rem;
    color: var(--color-text-primary, inherit);
    transition: background-color 0.12s;
  }

  .admin-layout__nav-link:hover {
    background-color: var(--color-surface-overlay, rgba(0, 0, 0, 0.05));
  }

  .admin-layout__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .admin-layout__header {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 0.625rem 1.25rem;
    border-bottom: 1px solid var(--color-border-default, currentColor);
    min-height: 3.25rem;
  }

  .admin-layout__user {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .admin-layout__email {
    font-size: 0.875rem;
    color: var(--color-text-secondary, inherit);
  }

  .admin-layout__main {
    padding: 1.5rem;
    flex: 1;
  }
</style>

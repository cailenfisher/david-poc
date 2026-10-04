<script lang="ts">
  import { createDictionary } from 'diglossia'
  import { getDictionary } from 'diglossia/svelte'
  import {
    Card,
    Badge,
    Button,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableHeader,
    TableCell,
  } from '@sveltebuilder/coreui'
  import type { PageData } from './$types'
  import PageViewWidget from '$lib/components/PageViewWidget.svelte'
  import { toPageViewChartPoints } from '$lib/utils/format-page-view'

  let { data }: { data: PageData } = $props()

  const dictionary = getDictionary()

  const pageViewCopy = $derived(createDictionary(data.pageViewCopy))
  const pageViewText = (slug: string) => pageViewCopy.localText(slug, 'page_view')
  const numberFormat = $derived(new Intl.NumberFormat(data.localeCode))

  type BadgeVariant = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

  const stats = $derived([
    {
      label: dictionary.localText('admin.dashboard.stat.total_users'),
      value: data.stats.totalUsers ?? '—',
      variant: 'default' as BadgeVariant,
    },
    {
      label: dictionary.localText('admin.dashboard.stat.active_sessions'),
      value: data.stats.activeSessions ?? '—',
      variant: 'info' as BadgeVariant,
    },
    {
      label: dictionary.localText('admin.dashboard.stat.published'),
      value: data.stats.published ?? '—',
      variant: 'success' as BadgeVariant,
    },
    {
      label: dictionary.localText('admin.dashboard.stat.pending_review'),
      value: data.stats.pendingReview ?? '—',
      variant: 'warning' as BadgeVariant,
    },
  ])

  type ItemStatus = 'active' | 'pending' | 'inactive'
  const statusVariant: Record<ItemStatus, BadgeVariant> = {
    active: 'success',
    pending: 'warning',
    inactive: 'default',
  }

  // Replace with a real load function query — see +page.server.ts
  const recentItems: { id: number; name: string; status: ItemStatus; date: string }[] = []
</script>

<div class="dashboard">
  <header class="dashboard__header">
    <h1 class="dashboard__title">{dictionary.localText('admin.dashboard.title')}</h1>
  </header>

  <section class="dashboard__stats" aria-label={dictionary.localText('admin.stats.key_metrics')}>
    {#each stats as stat}
      <Card>
        <div class="stat">
          <p class="stat__label">{stat.label}</p>
          <p class="stat__value">{stat.value}</p>
          <Badge variant={stat.variant} size="sm">{stat.variant}</Badge>
        </div>
      </Card>
    {/each}
  </section>

  {#if data.pageView}
    <section class="dashboard__widgets">
      <PageViewWidget
        title={pageViewText('page_view.widget_title')}
        viewCountLabel={pageViewText('page_view.view_count')}
        viewCountText={numberFormat.format(data.pageView.viewCount)}
        visitorCountLabel={pageViewText('page_view.visitor_count')}
        visitorCountText={numberFormat.format(data.pageView.visitorCount)}
        points={toPageViewChartPoints(data.pageView.daily, data.localeCode)}
        chartTitle={pageViewText('page_view.daily_title')}
        dayHeader={pageViewText('page_view.day')}
        reportHref="/admin/page-view"
        reportLabel={pageViewText('page_view.view_report')}
      />
    </section>
  {/if}

  <section class="dashboard__section">
    <div class="dashboard__section-header">
      <h2 class="dashboard__section-title">{dictionary.localText('admin.dashboard.recent.title')}</h2>
      <Button variant="secondary" size="sm">{dictionary.localText('action.view_all')}</Button>
    </div>

    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>{dictionary.localText('table.id')}</TableHeader>
          <TableHeader>{dictionary.localText('table.name')}</TableHeader>
          <TableHeader>{dictionary.localText('table.status')}</TableHeader>
          <TableHeader>{dictionary.localText('table.date')}</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {#each recentItems as item}
          <TableRow>
            <TableCell>{item.id}</TableCell>
            <TableCell>{item.name}</TableCell>
            <TableCell>
              <Badge variant={statusVariant[item.status]} size="sm">
                {dictionary.localText(`status.${item.status}`)}
              </Badge>
            </TableCell>
            <TableCell>{item.date}</TableCell>
          </TableRow>
        {:else}
          <TableRow>
            <TableCell colspan={4}>
              <p class="dashboard__empty">{dictionary.localText('feedback.empty')}</p>
            </TableCell>
          </TableRow>
        {/each}
      </TableBody>
    </Table>
  </section>
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .dashboard__header {
    display: flex;
    align-items: baseline;
  }

  .dashboard__title {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0;
    line-height: 1.25;
  }

  .dashboard__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stat__label {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text-secondary, inherit);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat__value {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    color: var(--color-text-primary, inherit);
  }

  .dashboard__widgets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 1rem;
  }

  .dashboard__section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .dashboard__section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dashboard__section-title {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
  }

  .dashboard__empty {
    margin: 0;
    font-size: var(--text-sm, 0.875rem);
    color: var(--color-text-secondary, inherit);
    text-align: center;
    padding: 1rem 0;
  }
</style>

<script lang="ts">
  import { enhance } from '$app/forms'
  import { createDictionary } from 'diglossia'
  import { Badge, Button, InlineNotification } from '@sveltebuilder/coreui'
  import type { ScreenFormResult } from '@sveltebuilder/content/views'
  import type { PageData } from './$types'

  let { data, form }: { data: PageData; form?: ScreenFormResult } = $props()

  const scoped = $derived(createDictionary(data.copy))
  const t = (slug: string) => scoped.localText(slug, 'content')

  // Published and archived stories are out of the desk's hands, so the board shows
  // the stages where work is still owed. Published gets a column anyway because
  // seeing what went out today is part of reading a desk.
  const columns = $derived(
    data.statuses
      .filter((status) => status.slug !== 'archived')
      .map((status) => ({
        status,
        cards: data.cards.filter((card) => card.statusId === status.id),
      }))
  )

  const ceilingOrdinal = $derived(
    data.statuses.find((status) => status.slug === data.boardCeiling)?.ordinal ?? Infinity
  )

  const headline = (id: number) => scoped.localText('headline', 'article', id)

  const bylineNames = (ids: number[]) =>
    ids.map((id) => scoped.localText('name', 'author_profile', id)).join(', ')

  const dateFormat = $derived(
    new Intl.DateTimeFormat(data.localeCode, { month: 'short', day: 'numeric' })
  )

  const overdue = (dueAt: string | null) => dueAt !== null && new Date(dueAt) < new Date()
</script>

<svelte:head>
  <title>{t('content.board.title')}</title>
</svelte:head>

<div class="board">
  <header class="board__header">
    <h1 class="board__title">{t('content.board.title')}</h1>
  </header>

  {#if form?.error}
    <InlineNotification severity="error" summary={form.error} />
  {/if}

  <div class="board__columns">
    {#each columns as column (column.status.id)}
      <section class="board__column" aria-label={scoped.localText('name', 'article_status', column.status.id)}>
        <h2 class="board__column-title">
          {scoped.localText('name', 'article_status', column.status.id)}
          <span class="board__count">{column.cards.length}</span>
        </h2>

        {#if column.cards.length === 0}
          <p class="board__empty">{t('content.board.empty')}</p>
        {:else}
          <ul class="board__cards">
            {#each column.cards as card (card.id)}
              <li class="board__card">
                <a href="/admin/content/article/{card.id}" class="board__card-headline">
                  {headline(card.id)}
                </a>

                <p class="board__card-meta">
                  {#if card.authorIds.length > 0}
                    {bylineNames(card.authorIds)}
                  {:else}
                    <span class="board__unassigned">{t('content.board.unassigned')}</span>
                  {/if}
                </p>

                <p class="board__card-meta">
                  {#if card.dueAt}
                    <span class={overdue(card.dueAt) ? 'board__overdue' : ''}>
                      {t('content.board.due')}
                      {dateFormat.format(new Date(card.dueAt))}
                      {#if overdue(card.dueAt)}· {t('content.board.overdue')}{/if}
                    </span>
                  {/if}
                  {#if card.embargoUntil}
                    <Badge variant="warning" size="sm">
                      {dateFormat.format(new Date(card.embargoUntil))}
                    </Badge>
                  {/if}
                </p>

                {#if card.requiredTotal > 0}
                  <p class="board__card-meta">
                    {t('content.board.checklist_progress')}
                    {card.requiredSatisfied}/{card.requiredTotal}
                  </p>
                {/if}

                <div class="board__card-actions">
                  <form method="POST" action="?/move" use:enhance>
                    <input type="hidden" name="article_id" value={card.id} />
                    <input type="hidden" name="direction" value="back" />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      disabled={card.statusOrdinal === data.statuses[0]?.ordinal}
                    >
                      ← {t('content.board.send_back')}
                    </Button>
                  </form>
                  <form method="POST" action="?/move" use:enhance>
                    <input type="hidden" name="article_id" value={card.id} />
                    <input type="hidden" name="direction" value="forward" />
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      disabled={card.statusOrdinal >= ceilingOrdinal}
                    >
                      {t('content.board.approve')} →
                    </Button>
                  </form>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  </div>
</div>

<style>
  .board {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: var(--space-6, 1.5rem);
  }

  .board__title {
    margin: 0;
    font-size: 1.5rem;
  }

  .board__columns {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(15rem, 1fr);
    gap: 1rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
  }

  .board__column {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .board__column-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid currentColor;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .board__count {
    font-weight: 400;
    color: var(--text-soft, inherit);
  }

  .board__cards {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .board__card {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius);
  }

  .board__card-headline {
    font-weight: 600;
    line-height: 1.3;
    text-decoration: none;
  }

  .board__card-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-soft, inherit);
  }

  .board__overdue {
    color: var(--text-danger, crimson);
    font-weight: 600;
  }

  .board__unassigned {
    font-style: italic;
  }

  .board__card-actions {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .board__empty {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-soft, inherit);
  }
</style>

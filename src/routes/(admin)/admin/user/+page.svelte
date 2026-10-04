<script lang="ts">
  import { enhance } from '$app/forms'
  import { createDictionary } from 'diglossia'
  import {
    Badge,
    Button,
    InlineNotification,
    Select,
    SelectItem,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '@sveltebuilder/coreui'
  import type { ScreenFormResult } from '@sveltebuilder/content/views'
  import type { PageData } from './$types'

  let { data, form }: { data: PageData; form?: ScreenFormResult } = $props()

  const scoped = $derived(createDictionary(data.copy))
  const t = (slug: string) => scoped.localText(slug, 'content')

  const authorName = (id: number) => scoped.localText('name', 'author_profile', id)

  const dateFormat = $derived(new Intl.DateTimeFormat(data.localeCode, { dateStyle: 'medium' }))

  // The last administrator cannot be demoted — the server refuses it too, so this
  // only keeps the button from offering something that will fail.
  const lastAdmin = $derived(data.adminCount <= 1)
</script>

<svelte:head>
  <title>{t('content.user.title')}</title>
</svelte:head>

<div class="people">
  <header class="people__header">
    <h1 class="people__title">{t('content.user.title')}</h1>
  </header>

  <InlineNotification severity="info" summary={t('content.user.no_invite_hint')} />

  {#if form?.error}
    <InlineNotification severity="error" summary={form.error} />
  {/if}

  <Table>
    <TableHead>
      <TableRow>
        <TableHeader>{t('content.user.email')}</TableHeader>
        <TableHeader>{t('content.user.admin')}</TableHeader>
        <TableHeader>{t('content.user.author_profile')}</TableHeader>
        <!-- Labelled rather than left empty: an unlabelled header is a type error
             here and reads as nothing to a screen reader. -->
        <TableHeader>{t('content.admin.view_public')}</TableHeader>
      </TableRow>
    </TableHead>
    <TableBody>
      {#each data.people as person (person.userAccountId)}
        <TableRow>
          <TableCell>
            {person.email ?? '—'}
            {#if person.userAccountId === data.currentUserAccountId}
              <Badge variant="info" size="sm">{t('content.user.self')}</Badge>
            {/if}
            <div class="people__since">{dateFormat.format(new Date(person.createdAt))}</div>
          </TableCell>

          <TableCell>
            <form method="POST" action="?/admin" use:enhance>
              <input type="hidden" name="user_account_id" value={person.userAccountId} />
              <input type="hidden" name="admin" value={person.admin ? 'false' : 'true'} />
              <Button
                type="submit"
                size="sm"
                variant={person.admin ? 'ghost' : 'secondary'}
                disabled={person.admin && lastAdmin}
              >
                {person.admin ? '✓ ' : ''}{t('content.user.admin')}
              </Button>
            </form>
          </TableCell>

          <TableCell>
            <form method="POST" action="?/author_profile" class="people__inline" use:enhance>
              <input type="hidden" name="user_account_id" value={person.userAccountId} />
              <Select
                name="author_profile_id"
                value={person.authorProfileId !== null ? String(person.authorProfileId) : ''}
              >
                <SelectItem value="" label={t('content.user.none')} />
                {#each data.authors as author (author.id)}
                  <SelectItem value={String(author.id)} label={authorName(author.id)} />
                {/each}
              </Select>
              <Button type="submit" size="sm" variant="secondary">
                {t('content.user.save')}
              </Button>
            </form>
          </TableCell>

          <TableCell>
            {#if person.authorProfileId !== null}
              {@const author = data.authors.find((a) => a.id === person.authorProfileId)}
              {#if author}
                <a href="/author/{author.slug}" class="people__link">{author.slug} →</a>
              {/if}
            {/if}
          </TableCell>
        </TableRow>
      {/each}
    </TableBody>
  </Table>
</div>

<style>
  .people {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: var(--space-6, 1.5rem);
    max-width: 64rem;
  }

  .people__title {
    margin: 0;
    font-size: 1.5rem;
  }

  .people__since {
    font-size: 0.75rem;
    color: var(--text-soft, inherit);
  }

  .people__inline {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .people__link {
    font-size: 0.8125rem;
    text-decoration: none;
  }
</style>

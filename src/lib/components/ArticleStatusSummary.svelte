<!--
  How many stories sit at each workflow status, each count linking to the story list
  filtered to that status. Resolves status names through diglossia, so it is an
  entity component.
-->
<script lang="ts">
  import { getDictionary } from 'diglossia/svelte'
  import type { DictionaryInstance } from 'diglossia'
  import type { ArticleStatusCount } from '$lib/types/dashboard'
  import FigureList from './FigureList.svelte'

  type Props = {
    statusCount: ArticleStatusCount[]
    localeCode: string
    dictionary?: DictionaryInstance
  }

  let { statusCount, localeCode, dictionary: dictionaryProp }: Props = $props()

  // svelte-ignore state_referenced_locally
  const dictionary = dictionaryProp ?? getDictionary()

  const numberFormat = $derived(new Intl.NumberFormat(localeCode))

  const figures = $derived(
    statusCount.map(({ status, articleCount }) => ({
      label: dictionary.localText('name', 'article_status', status.id),
      valueText: numberFormat.format(articleCount),
      href: `/admin/content/article?status=${encodeURIComponent(status.slug)}`,
    }))
  )
</script>

<FigureList {figures} />

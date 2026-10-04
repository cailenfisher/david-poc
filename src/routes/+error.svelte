<script lang="ts">
  import { getDictionary } from 'diglossia/svelte'
  import { page } from '$app/state'

  const dictionary = getDictionary()
</script>

<main>
  <h1>{page.status}</h1>
  <p>{page.error?.message ?? dictionary.localText('feedback.error')}</p>
</main>

<script lang="ts">
  import { Button } from '@sveltebuilder/coreui'
  import { getDictionary } from 'diglossia/svelte'
  import { Field, Input } from '@sveltebuilder/coreui'
  import type { ActionData, PageData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const dictionary = getDictionary()

  const title = $derived(dictionary.localText('user.sign_in'))
  const subtitle = $derived(dictionary.localText('user.sign_in.subtitle'))
  const signInWithGoogle = $derived(dictionary.localText('user.sign_in_with_google'))
</script>

<div class="sign-in-page">
  <div class="sign-in-card">
    <header class="sign-in-card__header">
      <h1 class="sign-in-card__title">{title}</h1>
      <p class="sign-in-card__subtitle">{subtitle}</p>
    </header>

    {#if form?.error}
      <p class="sign-in-card__error" role="alert">{form.error}</p>
    {/if}

    <form method="post" action="?/google">
      <Button type="submit" full>{signInWithGoogle}</Button>
    </form>

    {#if data.dev}
      <!-- POC-ONLY: local password sign-in, so the admin area is reachable
           without a Google OAuth round trip. Dev builds only. -->
      <div class="sign-in-card__divider"><span>or sign in locally</span></div>

      <form method="post" action="?/password" class="sign-in-card__local">
        <Field label="Email" id="email">
          <Input id="email" name="email" type="email" value="cailen.fisher@gmail.com" required />
        </Field>
        <Field label="Password" id="password">
          <Input id="password" name="password" type="password" value="david-poc-local" required />
        </Field>
        <Button type="submit" variant="secondary" full>Sign in with password</Button>
      </form>
    {/if}
  </div>
</div>

<style>
  .sign-in-page {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    min-height: 100dvh;
  }

  .sign-in-card {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 2rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    background-color: var(--surface);
  }

  .sign-in-card__header {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .sign-in-card__title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.25;
  }

  .sign-in-card__subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-soft);
  }

  .sign-in-card__divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.75rem;
    color: var(--text-soft);
  }

  .sign-in-card__divider::before,
  .sign-in-card__divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background-color: var(--border-color);
  }

  .sign-in-card__local {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .sign-in-card__error {
    margin: 0;
    font-size: 0.875rem;
    color: var(--danger-text);
  }
</style>

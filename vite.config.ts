import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
  ssr: {
    noExternal: [/^@sveltebuilder\//, 'bits-ui', 'svelte-toolbelt', 'runed']
  }
})

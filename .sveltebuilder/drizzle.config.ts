import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './.sveltebuilder/schema.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
});

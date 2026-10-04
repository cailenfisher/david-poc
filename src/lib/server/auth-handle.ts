// Re-exports the Supabase SSR provider handle so hooks.server.ts can import
// from a stable path that each template fills in differently.
// Native fills this with the Auth.js handle from @auth/sveltekit.

import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const providerHandle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createSupabaseServerClient(event.cookies);
  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version';
    },
  });
};

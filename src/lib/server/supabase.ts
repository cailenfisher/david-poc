import { createServerClient } from '@supabase/ssr'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public'
import type { Cookies } from '@sveltejs/kit'

// The publishable key (sb_publishable_…) replaces the legacy anon key, which
// Supabase is retiring at the end of 2026. It carries the same low privileges, so
// RLS remains the security boundary — this client is safe to build per request and
// is the only path route code has to the database.

export function createSupabaseServerClient(cookies: Cookies) {
  return createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookies.set(name, value, { ...options, path: '/' })
        )
      }
    }
  })
}

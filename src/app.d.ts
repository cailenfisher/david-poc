import type { SupabaseClient } from '@supabase/supabase-js';
import type { DictionaryPayload, Locale } from 'diglossia';

declare global {
  namespace App {
    interface Locals {
      // Request-scoped Supabase client carrying this request's session cookies.
      // The only database handle route code gets: queries run through PostgREST as
      // the authenticated (or anon) role, so RLS applies to every one of them.
      supabase: SupabaseClient;
      // Domain principal ID (public.user_account.id). Null when unauthenticated.
      userAccountId: number | null;
      locale: Locale;
      defaultLocale: Locale;
    }
    interface PageData {
      dictionary: DictionaryPayload;
      locale: Locale;
      defaultLocale: Locale;
      locales: Locale[];
    }
    interface Error {
      message: string;
      code?: string;
    }
  }
}

export {};

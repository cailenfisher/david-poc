import type { DictionaryPayload } from 'diglossia';

/**
 * Narrows a to-one embed to the single row it actually is.
 *
 * PostgREST returns a many-to-one embed (`navigation_item` → `local_text_link`) as
 * an object, but supabase-js has no way to know the relation's cardinality without
 * generated database types, so it types every embed as an array. Reading `.slug`
 * straight off the embed therefore fails to typecheck while working perfectly at
 * runtime — which is exactly the kind of mismatch that goes unnoticed until
 * `svelte-check` runs.
 *
 * Accepts either shape so it stays correct if generated types are introduced later.
 */
export function toOne<T>(embed: T | T[] | null | undefined): T | null {
  if (embed === null || embed === undefined) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

/** One row as `public.get_dictionary` returns it. bigint columns arrive as strings. */
export type DictionaryRow = {
  link_id: number | string;
  slug: string;
  scope: string | null;
  entity_id: number | string | null;
  content: string;
  locale_code: string;
};

/**
 * The serialization boundary for dictionary rows: snake_case stops here, and the
 * bigint columns PostgREST sends as strings become numbers. Nothing downstream
 * sees either.
 */
export function toDictionaryPayload(rows: DictionaryRow[] | null): DictionaryPayload {
  return (rows ?? []).map((row) => ({
    link: {
      id: Number(row.link_id),
      slug: row.slug,
      scope: row.scope,
      entityId: row.entity_id !== null ? Number(row.entity_id) : null,
    },
    content: row.content,
    localeCode: row.locale_code,
  }));
}

/** A `locale` row with every column the `Locale` type needs. */
export const LOCALE_COLUMNS = 'id, code, name, native_name, dir';

export type LocaleRow = {
  id: number;
  code: string;
  name: string;
  native_name: string;
  dir: string;
};

/** Same boundary rule for locales — selected with LOCALE_COLUMNS. */
export function toLocale(row: LocaleRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nativeName: row.native_name,
    dir: row.dir as 'ltr' | 'rtl',
  };
}

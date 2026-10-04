import type { DictionaryPayload } from 'diglossia';
import type { SupabaseClient } from '@supabase/supabase-js';

type CopyRow = {
  content: string;
  locale: { code: string } | { code: string }[] | null;
  local_text_link:
    | { id: number; slug: string; scope: string | null; entity_id: number | null }
    | { id: number; slug: string; scope: string | null; entity_id: number | null }[]
    | null;
};

/** supabase-js types every embed as an array, having no way to know the cardinality. */
const one = <T>(value: T | T[] | null): T | null =>
  value === null ? null : Array.isArray(value) ? (value[0] ?? null) : value;

/**
 * One entry per `(slug, scope, entityId)` key, the user's locale winning over the fallback.
 *
 * Rows arrive in no guaranteed order, so this cannot rely on ordering: it overwrites an
 * existing entry only when the incoming row is the user's locale. That pass is what
 * guarantees the one-entry-per-key rule diglossia relies on — it only ever flattens a
 * payload, it does not resolve locale priority.
 */
function resolveOneEntryPerKey(data: unknown, userCode: string): DictionaryPayload {
  const resolved = new Map<string, DictionaryPayload[number]>();

  for (const row of (data ?? []) as CopyRow[]) {
    const link = one(row.local_text_link);
    const localeCode = one(row.locale)?.code;
    if (!link || !localeCode) continue;

    const key = `${link.slug}|${link.scope ?? ''}|${link.entity_id ?? ''}`;
    if (resolved.get(key)?.localeCode === userCode) continue;

    resolved.set(key, {
      link: {
        id: Number(link.id),
        slug: link.slug,
        scope: link.scope,
        entityId: link.entity_id === null ? null : Number(link.entity_id),
      },
      content: row.content,
      localeCode,
    });
  }

  return [...resolved.values()];
}

/**
 * Loads every copy row for one or more scopes — a scope's UI copy (entity_id null)
 * and all of its entity-bound copy — resolved to one entry per key and ready for
 * `createDictionary()`.
 *
 * Why not `get_dictionary`: its `entity_id_filter` is null-or-equal, so a null filter
 * restricts to `entity_id is null`. It can return one scope's UI copy, or one single
 * entity's copy, but never a whole scope's entity copy in one call — which is what a
 * list screen of N rows needs. Calling it per row would be N+1 round trips. Use the
 * RPC directly when a route genuinely wants one entity (a detail screen can), and
 * this when it wants a scope.
 *
 * Locale-priority resolution therefore happens here rather than in SQL. That is the
 * app's job either way — diglossia only ever flattens an already-resolved payload —
 * and the userCode-wins pass below is what guarantees the one-entry-per-key rule.
 *
 * Module screens are the main caller: `get_dictionary` with a null scope filter means
 * "scope is null", so the root dictionary carries global copy only and a module's own
 * copy has to be loaded by the screen that needs it.
 */
export async function loadScopedCopy(
  supabase: SupabaseClient,
  scopes: string | string[],
  userCode: string,
  fallbackCode: string
): Promise<DictionaryPayload> {
  const scopeList = Array.isArray(scopes) ? scopes : [scopes];
  if (scopeList.length === 0) return [];

  const { data, error } = await supabase
    .from('local_text')
    .select('content, locale!inner(code), local_text_link!inner(id, slug, scope, entity_id)')
    .in('local_text_link.scope', scopeList)
    .in('locale.code', [userCode, fallbackCode]);

  if (error) throw error;

  return resolveOneEntryPerKey(data, userCode);
}

/**
 * Loads copy for a known set of entities — the rows for `(scope, entityId)` pairs — resolved
 * to one entry per key.
 *
 * `loadScopedCopy` is the wrong tool whenever a scope is unbounded. It fetches a whole
 * scope, which is right for suppliers or storage locations and wrong for articles: a
 * publisher with ten thousand of them would ship ten thousand headlines to render one page.
 * This takes the ids the screen is actually going to show.
 *
 * The filter is `scope in (…) and entity_id in (…)` rather than a precise list of pairs,
 * because PostgREST cannot express a tuple-IN. That over-fetches the cross product — a
 * block id that happens to equal an article id brings both rows — which is harmless, since
 * keys are `(slug, scope, entityId)` and the extra rows simply never get looked up. What
 * matters is that the result is bounded by the ids passed in rather than by the table size.
 */
export async function loadEntityCopy(
  supabase: SupabaseClient,
  entities: Array<{ scope: string; ids: number[] }>,
  userCode: string,
  fallbackCode: string
): Promise<DictionaryPayload> {
  const scopes = [...new Set(entities.map((e) => e.scope))];
  const ids = [...new Set(entities.flatMap((e) => e.ids))];
  if (scopes.length === 0 || ids.length === 0) return [];

  const { data, error } = await supabase
    .from('local_text')
    .select('content, locale!inner(code), local_text_link!inner(id, slug, scope, entity_id)')
    .in('local_text_link.scope', scopes)
    .in('local_text_link.entity_id', ids)
    .in('locale.code', [userCode, fallbackCode]);

  if (error) throw error;

  return resolveOneEntryPerKey(data, userCode);
}

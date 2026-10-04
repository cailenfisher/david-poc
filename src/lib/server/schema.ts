import {
  pgSchema,
  pgTable,
  bigint,
  boolean,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { locale, localTextLink } from '@sveltebuilder/local-text-schema/schema';

// Reference Supabase's managed auth schema. The table is `auth.users` (plural) with
// a uuid PK — this is Supabase's fixed schema, not something we define.
const authSchema = pgSchema('auth');

// Minimal stub — only the PK is needed for the FK reference.
const authUser = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});

// ── Domain principal ──────────────────────────────────────────────────────────
//
// user_account is the domain principal. Its bigint PK is the identity used
// everywhere in public.*, including local_text_link.entity_id for user display
// names and local_text for any user-facing copy tied to this entity.
//
// auth_user_id links to the identity provider (Supabase auth.users in
// SuperPrototype; Auth.js auth.user in Native). It is stored as text because
// both providers use text PKs, and the domain must remain decoupled from the
// provider's type choice.
//
// email_address and display_name are intentionally absent — those are identity
// layer and live in the provider's user table. User-facing copy (display name,
// etc.) is linked via local_text_link with scope='user_account' and
// entity_id=user_account.id per the i18n architecture.

export const userAccount = pgTable(
  'user_account',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    authUserId: uuid('auth_user_id')
      .notNull()
      .unique()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    admin: boolean('admin').notNull().default(false),
  },
  (table) => [
    index('idx_user_account_auth_user_id').on(table.authUserId),
  ],
);

export const navigationItem = pgTable(
  'navigation_item',
  {
    id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    localTextLinkId: bigint('local_text_link_id', { mode: 'number' })
      .notNull()
      .references(() => localTextLink.id),
    href: text('href').notNull(),
    scope: text('scope').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    uniqueIndex('uq_navigation_item_href_scope').on(table.href, table.scope),
  ],
);

// ── Visitor analytics ─────────────────────────────────────────────────────────
//
// One row per page a visitor actually looked at. Recorded from the browser after
// navigation (see src/lib/utils/page-view-beacon.ts), not from the server hook,
// because hover-preloading and invalidations would otherwise count as views.
//
// Deliberately anonymous: visitor_id is a random first-party cookie value with no
// link to user_account, and only the referrer's host is kept, never its full URL.
// Event-log table, so bigint per the schema conventions. Aggregation lives in SQL
// (supabase/supplemental/07-page-view.sql), never in route code.

export const pageView = pgTable(
  'page_view',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    visitorId: uuid('visitor_id').notNull(),
    path: text('path').notNull(),
    referrerHost: text('referrer_host'),
    localeId: bigint('locale_id', { mode: 'number' }).references(() => locale.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('idx_page_view_created_at').on(table.createdAt),
  ],
);

export type UserAccount = typeof userAccount.$inferSelect;
export type NewUserAccount = typeof userAccount.$inferInsert;
export type NavigationItem = typeof navigationItem.$inferSelect;
export type NewNavigationItem = typeof navigationItem.$inferInsert;
export type PageView = typeof pageView.$inferSelect;
export type NewPageView = typeof pageView.$inferInsert;

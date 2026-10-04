# SvelteBuilder — SuperPrototype

A SvelteKit app scaffolded by [SvelteBuilder](https://github.com/cailenfisher/SvelteBuilder), using
Supabase for both Postgres and Auth.

## Local development

Requires [Docker](https://docs.docker.com/get-docker/) (the Supabase CLI runs Postgres, Auth,
Storage, and Studio as containers).

```bash
cp .env.example .env
pnpm install
pnpm sveltebuilder sync:supabase   # generates supabase/migrations from Drizzle schema
pnpm db:start                      # supabase start — first run pulls several GB of images
```

`db:start` prints the local API URL and keys. To get them pre-mapped to this project's `.env`
names, run:

```bash
supabase status -o env \
  --override-name api.url=PUBLIC_SUPABASE_URL \
  --override-name auth.publishable_key=PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

and copy the two matching lines into `.env`. There is no `DATABASE_URL`: this app never opens a
direct Postgres connection, which is what keeps RLS in force on every query (see
[CLAUDE.md](./CLAUDE.md)).

```bash
pnpm db:reset                      # applies supabase/migrations + supabase/seed.sql
pnpm dev
```

Studio (a local admin UI for the Postgres database itself) is at `http://127.0.0.1:54323`.

Everything above `(admin)` in `src/routes` requires being signed in, and the scaffold's only
sign-in method is Google OAuth — there's no local bypass. To test it:

1. Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (any existing one works too) and add `http://127.0.0.1:54321/auth/v1/callback` to its authorized
   redirect URIs.
2. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.
3. Flip `enabled = true` under `[auth.external.google]` in `supabase/config.toml`.
4. `pnpm db:stop && pnpm db:start` (config changes need a restart).

Without it, the public route (`/`) and the read-only `/api/locale` and `/api/local-text/*`
endpoints still work — only the admin section is gated.

The first person to ever sign in is provisioned as `user_account.admin = true` automatically
(by the `ensure_user_account()` function in `supabase/supplemental/00-auth-functions.sql`, called
from `src/lib/server/auth-resolver.ts`) — there's no separate invite step on a fresh database.
Promote or revoke admins after that with a direct SQL update.

When you change the schema (`src/lib/server/schema.ts` or a module's), re-run
`pnpm sveltebuilder sync:supabase` to regenerate migrations, then `pnpm db:reset` to apply them.

## Deploying to a hosted Supabase project

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Then set the hosted project's URL/keys in your deployment environment (from Project Settings >
API / Database), and configure the same Google OAuth provider under Authentication > Providers,
with `https://<project-ref>.supabase.co/auth/v1/callback` as the redirect URI.

## Everything else

See [CLAUDE.md](./CLAUDE.md) for the i18n architecture, schema rules, naming conventions, and the
RLS/auth pattern this project follows.

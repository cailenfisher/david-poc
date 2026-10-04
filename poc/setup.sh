#!/usr/bin/env bash
# Rebuild the David POC from a clean state.
#
# Assumes: Docker running, this directory already scaffolded and `pnpm install` done.
# Scaffolded with:
#   npx create-sveltebuilder@latest david-poc \
#     --template superprototype --pm pnpm --modules content --screens all
set -euo pipefail
cd "$(dirname "$0")/.."

SUPA="npx --yes supabase@2.119.0"

echo "==> Starting Supabase (default ports; the Google OAuth client's redirect URI is"
echo "    pinned to http://127.0.0.1:54321/auth/v1/callback, so this must own 54321)"
set -a; source .env; set +a
$SUPA start

echo "==> Applying migration + seed"
$SUPA db reset

PUB=$(grep '^PUBLIC_SUPABASE_PUBLISHABLE_KEY=' .env | cut -d= -f2-)
SECRET=$($SUPA status -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["SECRET_KEY"])')
API=http://127.0.0.1:54321

mkuser() {
  curl -s -X POST "$API/auth/v1/admin/users" \
    -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\",\"email_confirm\":true}" > /dev/null
}
token() {
  curl -s -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $PUB" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'
}

echo "==> Creating accounts (admin FIRST — ensure_user_account() grants admin only to"
echo "    the very first user_account row)"
mkuser "cailen.fisher@gmail.com" "david-poc-local"
mkuser "reporter@example.com"    "reporter-local"

for creds in "cailen.fisher@gmail.com:david-poc-local" "reporter@example.com:reporter-local"; do
  email=${creds%%:*}; pass=${creds##*:}
  curl -s -X POST "$API/rest/v1/rpc/ensure_user_account" \
    -H "apikey: $PUB" -H "Authorization: Bearer $(token "$email" "$pass")" \
    -H "Content-Type: application/json" -d '{}' > /dev/null
done

echo "==> Re-running the seed so desk assignments land (they need a principal, which"
echo "    does not exist until the step above)"
docker exec -i supabase_db_david-poc psql -U postgres -d postgres -q < supabase/seed.sql > /dev/null

rm -rf node_modules/.vite

cat <<'DONE'

Ready. Run `pnpm dev` then:

  Public
    /                            the front page (curated, falls back to recency)
    /article/<slug>              a story, with live coverage where there is a thread
    /section/<slug>              section front
    /author/<slug>               reporter page — what the article JSON-LD points at
    /topic/<slug>                topic page (/?topic=x 308s here)
    /preview/poc-preview-port-authority    unpublished, by token
    /rss.xml  /sitemap.xml  /sitemap-news.xml

  Newsroom
    /sign-in                     Google, or the local password form
    /admin/content/board         workflow columns, advance and send back
    /admin/content/article       every story, every status
    /admin/content/article/<id>  the editor: copy per locale, body blocks,
                                 bylines, filing, publishing
    /admin/content/comment       moderation queue
    /admin/user                  admin flag and author-profile linking
    /admin/page-view             visitor analytics (also a widget on /admin/dashboard)

  admin:    cailen.fisher@gmail.com / david-poc-local
  reporter: reporter@example.com    / reporter-local   (non-admin, for RLS checks)

Note: `supabase db reset` sometimes fails the first time with a realtime container
error. Re-run it; the second attempt succeeds.
DONE

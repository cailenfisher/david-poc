# Admin mobile pass: implementation plan

**Goal:** make the `/admin` area usable on phones and tablets through cheap, low-risk changes. This is **not** a mobile redesign. Newsroom work (story editing, the board) will stay best on a large screen, and that is acceptable. If a fix needs a new component, a restructured page, or more than ~30 lines in one file, it is out of scope: write it down in the report (Stage 5) and move on.

**Headline change:** the admin sidebar becomes collapsible. It shows **only icons by default below 64rem (1024px)** and is **expanded by default at 64rem and up**. Operators can toggle it either way at any size.

Read `CLAUDE.md` before starting. It is binding, especially the naming rules (no abbreviations, no `is`/`has` prefixes, BEM `kebab-case` classes) and the accessibility rules.

---

## Ground rules (all stages)

1. **Stages run in order.** Each stage ends with a **verification block**. Do not start the next stage until every check in the current one passes.
2. **Commit at the end of each stage** on the current branch, with the message `admin mobile: stage N, <short summary>`. **Never push.**
3. **`pnpm check` must stay at 0 errors.** The baseline is **0 errors, 2 warnings**: `src/routes/+layout.svelte` 21:34 `state_referenced_locally`, and `local-text/+page.svelte`, an unused `.local-text-admin__content-cell` selector. Leave both alone, and add no new warnings.
4. **Never edit `node_modules/`**, including `@sveltebuilder/coreui`. If a problem sits inside a coreui component, record it in the report rather than overriding it per page.
5. **Use CSS logical properties** (`inline-start`/`inline-end`, `border-inline-end`, `inset-inline-start`, `padding-inline`, `margin-block`) in any rule you write or touch. The app ships an Arabic (RTL) locale, and the current sidebar's `border-right` is wrong in RTL.
6. **Breakpoints** are literal values, because custom properties cannot be used in media queries:
   - `48rem` (768px): phone vs. tablet. Spacing tweaks.
   - `64rem` (1024px): navigation default flips from rail to expanded, and the expanded navigation stops overlaying content.
   - Use the `width < 48rem` / `width >= 64rem` range syntax.
7. **Database safety:** never run `pnpm db:reset`, `supabase db reset`, or anything with `--linked`. The project is linked to a hosted Supabase project, and a reset wipes the operator's local admin account. The only database write in this plan is the small insert in Stage 2, run with `--local`.
8. **The dev server is already running** at `http://localhost:5173` against local Supabase. Do not start another one.
9. **If a tool call is denied by a permission prompt or classifier, stop and report what you were trying to do.** Do not find a workaround.
10. Don't touch the public site, `sign-in`, `sign-out`, or any `+page.server.ts` / `+layout.server.ts` load logic.

---

## Stage 0: screenshot tooling

**Why:** you need to see the admin at phone, tablet, and desktop widths, and get an objective "does anything overflow horizontally?" signal. The admin is behind Google OAuth, so the script has to authenticate without a human.

### 0.1 Install

- `pnpm add -D playwright` (the library, not `@playwright/test`; no test runner is wanted).
- If the first launch fails because the browser build is missing, run `pnpm exec playwright install chromium`.
- Add `.screenshots/` to `.gitignore`.

### 0.2 `scripts/admin-screenshot.ts`

Plain TypeScript run directly by Node (Node 25 strips types natively). Use **erasable syntax only**: no `enum`, no `namespace`, no parameter properties, and `import type` for type-only imports. Add the package script `"screenshot": "node scripts/admin-screenshot.ts"`.

**Authentication: mint a fresh local session on every run.** Sessions expire after an hour, so a saved one would go stale.

1. Read `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `.env`. Use a minimal line parser and add no dotenv dependency.
2. **Refuse to run** unless the `PUBLIC_SUPABASE_URL` host is `localhost` or `127.0.0.1`. Exit non-zero with a clear message.
3. Get the local secret key by parsing `pnpm exec supabase status -o env` (lines like `KEY="value"`). Prefer `SECRET_KEY` and fall back to `SERVICE_ROLE_KEY`.
4. With a `@supabase/supabase-js` admin client (secret key):
   - Pick the account. Use env `SCREENSHOT_EMAIL` if set. Otherwise take the first `user_account` row (by `id`) where `admin = true and active = true`, then `auth.admin.getUserById(auth_user_id)` to get its email.
   - `auth.admin.generateLink({ type: 'magiclink', email })` and take `data.properties.hashed_token`.
5. Create a `@supabase/ssr` `createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll, setAll } })` backed by an in-memory `Map`. Call `auth.verifyOtp({ type: 'magiclink', token_hash })`. The SSR client writes the session into the map in exactly the cookie format the app's `hooks.server.ts` reads, including the cookie name derived from the URL and chunking. **Use the exact same URL string as the app**, or the cookie name won't match.
6. Pass those cookies to Playwright with `context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: BASE_URL })))`.
7. **Never print or write the secret key, tokens, or cookie values** to stdout, files, or the report.
8. After the first navigation, if the final URL is `/sign-in` or the response is 403, exit non-zero with "authentication failed".

> **Unverified.** This auth flow is designed but not yet tested. It was not proven before handoff because reading the local secret key needs the operator's approval. If `verifyOtp` does not produce working cookies, use the fallback instead: a `--login` mode that opens a **headed** Chromium at `/sign-in`, waits up to 3 minutes for the URL to reach `/admin`, and saves `context.storageState()` to `.screenshots/.auth.json`; later runs load that file. Note in the report which approach you used.

**Viewports.** All shots use `fullPage: true`.

| name | width × height | options |
|---|---|---|
| `phone` | 390 × 844 | `isMobile: true, hasTouch: true, deviceScaleFactor: 2` |
| `tablet` | 820 × 1180 | `isMobile: true, hasTouch: true, deviceScaleFactor: 2` |
| `laptop` | 1024 × 768 | none (sits exactly on the 64rem breakpoint) |
| `desktop` | 1440 × 900 | none |

`hasTouch` matters: it makes `@media (pointer: coarse)` match, which Stage 3 relies on.

**Routes.** Static:
`/admin/dashboard`, `/admin/content/board`, `/admin/content/article`, `/admin/content/comment`, `/admin/page-view`, `/admin/user`, `/admin/local-text`, `/admin/locale`, `/admin/navigation-item`.

Detail routes are discovered at run time. For each of `content/article`, `local-text`, `locale`, `navigation-item`, open the list page and take the first `a[href]` matching `^/admin/<that path>/\d+$`. If none is found, skip it and say so in the output.

**Per shot:**

- `page.goto(url, { waitUntil: 'networkidle' })`.
- **Overflow check:** evaluate `document.documentElement.scrollWidth - window.innerWidth`. If it is greater than 0, also collect up to 5 offending elements: those whose `getBoundingClientRect().right > innerWidth + 1` and that have **no ancestor** with computed `overflow-x` of `auto`, `scroll`, or `hidden`. Describe each as `tag.class-list` plus its right edge in px.
- Save to `.screenshots/<label>/<viewport>/<route-slug>.png`. Route slug example: `/admin/content/article/12` becomes `admin-content-article-id.png`.

**CLI flags:**

- `--label <name>` (default `current`).
- `--route <path>` (repeatable; limits the run to those routes).
- `--viewport <name>` (repeatable).
- `--open-navigation`: **added in Stage 2** (see 2.6). Do not implement it now.

**Output:** a compact table on stdout (route, viewport, overflow px, offenders) and the same data as `.screenshots/<label>/report.json`.

### 0.3 Capture the baseline

Run `pnpm screenshot --label before`. Keep `report.json`: Stage 5 compares against it.

### Stage 0 verification

- [ ] `pnpm screenshot --label before` completes and writes PNGs for all 4 viewports × all discovered routes.
- [ ] Open (Read) `before/phone/admin-dashboard.png` and `before/desktop/admin-dashboard.png`. Both show the admin UI, not the sign-in page.
- [ ] Changing `PUBLIC_SUPABASE_URL` to a non-local host (in a temporary env override, not by editing `.env`) makes the script refuse to run.
- [ ] `grep -r` the `.screenshots/` output and stdout for `eyJ` and `sb_secret`. There must be no hits.
- [ ] `pnpm check` is unchanged from the baseline.
- [ ] Commit (including `package.json`, `pnpm-lock.yaml`, `.gitignore`, the script).

---

## Stage 1: layout shell spacing

All changes in `src/routes/(admin)/+layout.svelte` plus five pages. This stage contains **no navigation behavior changes**.

### 1.1 One owner for page padding

`.admin-layout__main` already pads by `1.5rem`. Five pages add their **own** padding on top, so on a phone they lose 3rem per side. Remove the `padding` declaration from the page's root rule in:

| file | rule |
|---|---|
| `admin/content/board/+page.svelte` | `.board` |
| `admin/content/article/+page.svelte` | `.admin-article-list` |
| `admin/content/article/[id]/+page.svelte` | `.admin-article` |
| `admin/content/comment/+page.svelte` | `.moderation` |
| `admin/user/+page.svelte` | `.people` |

Change only the `padding` line and leave `max-width`/`margin-inline` alone. This is a visible change on desktop too: those five pages now line up with the others. That is intended.

### 1.2 Layout padding by width

- `.admin-layout__main`: `padding: 1rem` below 48rem and `1.5rem` from 48rem (the current value).
- `.admin-layout__header`: `padding-inline: 1rem` below 48rem.

### 1.3 Header gets the admin title

Move the `admin.title` home link (`<a href="/admin/dashboard">`) **out of the sidebar's `.admin-layout__logo`** and into the start of `.admin-layout__header`, styled as it is now (600 weight, `color: inherit`, no underline). Change the header to `justify-content: space-between`. Delete the now-empty `.admin-layout__logo` block and its CSS.

This is required by Stage 2: a link inside the icon rail would be clipped but still focusable.

### 1.4 Header on phones

Below 48rem, hide `.admin-layout__email` with `display: none`. The `Avatar` already carries the email as `alt`, and the sign-out button stays.

### 1.5 RTL fix

`.admin-layout__sidebar`: change `border-right` to `border-inline-end`.

### Stage 1 verification

- [ ] `pnpm check` matches the baseline.
- [ ] `pnpm screenshot --label stage-1 --viewport phone --viewport desktop`. On the five pages above, phone content now starts about 1rem from the edge of the content area, not about 3rem.
- [ ] The desktop header shows the admin title at the start and the user block at the end.
- [ ] Commit.

---

## Stage 2: collapsible navigation

All changes in `src/routes/(admin)/+layout.svelte`, plus one seed file pair.

### 2.1 Behavior spec

| Screen | Default | After the operator expands it | After the operator collapses it |
|---|---|---|---|
| `< 64rem` | **icon rail** | full-width panel **overlaying** content; content does not shift | rail |
| `>= 64rem` | **expanded**, in the layout flow (as today) | in the layout flow | rail; content widens to use the space |

- **Rail:** about `3.75rem` wide. Only icons are visible: labels, chevron, and nested indentation are clipped or removed. Every icon, including the nested settings items, is fully visible and horizontally centered.
- **Expanded:** `14rem` wide (today's 224px).
- **Overlay closes**, only when below 64rem, and only when expanded:
  - after any navigation (`afterNavigate`);
  - on `Escape` while focus is inside the nav, returning focus to the toggle;
  - when focus leaves the nav (`focusout` whose `relatedTarget` is outside the `<nav>`);
  - on a click on a scrim covering the content area.
- **The 64rem-and-up choice is not persisted.** A reload returns to the default. Persistence is out of scope.
- **No layout flash on load.** The server-rendered HTML must already show the right state for the viewport, so the defaults have to come from CSS media queries and not from JavaScript.

### 2.2 State (recommended shape)

```ts
import { MediaQuery } from 'svelte/reactivity'
import { afterNavigate } from '$app/navigation'

// Fallback is used during SSR only; CSS decides what is actually drawn.
const wideScreen = new MediaQuery('min-width: 64rem', true)

// null = follow the screen size. A boolean is the operator's explicit choice.
let navigationChoice = $state<boolean | null>(null)
const navigationExpanded = $derived(navigationChoice ?? wideScreen.current)
const navigationOverlay = $derived(navigationExpanded && !wideScreen.current)
```

- Root element: `data-navigation={navigationChoice === null ? 'auto' : navigationChoice ? 'expanded' : 'collapsed'}`.
- Toggle: `navigationChoice = !navigationExpanded`.
- Closing the overlay sets `navigationChoice = null`, not `false`, so the screen-size default takes over again.
- `aria-expanded` is `true` in server HTML on phones until hydration corrects it. That is acceptable. Do not try to fix it.

### 2.3 CSS (recommended shape)

Drive the state from **custom properties set in only a few places**, rather than duplicating rail rules under several selectors:

```css
.admin-layout {
  --navigation-rail-width: 3.75rem;
  --navigation-full-width: 14rem;
  --navigation-width: var(--navigation-rail-width);   /* what the <nav> draws */
  --navigation-nested-indent: 0;
  --navigation-track: var(--navigation-rail-width);   /* what the layout reserves */
  display: grid;
  grid-template-columns: var(--navigation-track) minmax(0, 1fr);
}

.admin-layout[data-navigation='expanded'] {
  --navigation-width: var(--navigation-full-width);
  --navigation-nested-indent: 1rem;
}

@media (width >= 64rem) {
  .admin-layout[data-navigation='auto'] {
    --navigation-width: var(--navigation-full-width);
    --navigation-nested-indent: 1rem;
  }
  /* Wide screens reserve whatever the nav draws; narrow ones always reserve the rail,
     so an expanded nav overlays instead of squeezing the content. */
  .admin-layout { --navigation-track: var(--navigation-width); }
}
```

- The `<nav>` has `width: var(--navigation-width)`, `position: sticky; inset-block-start: 0; block-size: 100dvh`, `overflow-y: auto; overflow-x: hidden`, and a `z-index` above content. Because its width can exceed its grid track below 64rem, it overlays the content.
- Labels clip naturally (`white-space: nowrap` on links) rather than being `display: none`, so **link accessible names are preserved**. Don't add `aria-label`s to links.
- `.admin-layout__nav--nested` uses `padding-inline-start: var(--navigation-nested-indent)`.
- Focus rings inside the nav use `outline-offset: -2px`, because `overflow-x: hidden` would clip a positive offset.
- When `navigationOverlay` is true, add a shadow to the nav (`var(--shadow-lg)`).
- An optional `transition: inline-size` on the nav is fine, but it must be disabled under `prefers-reduced-motion: reduce`, alongside the existing rule.
- Below 64rem, change `.admin-layout`'s existing `min-height: 100dvh` only if the screenshots show a need.

### 2.4 Markup

- First child of `<nav>`: a toggle `<button type="button">` with `aria-expanded={navigationExpanded}`, `aria-controls="admin-navigation-list"`, `aria-label={dictionary.localText('admin.nav.toggle')}`, and an `fa-solid fa-bars` icon (`aria-hidden="true"`). It is styled like `.admin-layout__nav-link` so its icon lines up with the rail icons.
- Give the top-level `<ul class="admin-layout__nav">` the id `admin-navigation-list`.
- Scrim: rendered only when `navigationOverlay` is true. It is a sibling after the nav, covers the content area, uses a translucent `background-color: rgb(0 0 0 / 0.3)`, and has `aria-hidden="true"`. Its `onclick` sets `navigationChoice = null`. Svelte will warn about a click handler on a non-interactive element: suppress it with a `<!-- svelte-ignore ... -->` comment that explains Escape and focus-out are the keyboard paths.
- Keep the existing "Application settings" group behavior (the writable `$derived` and the auto-open when the current page is inside it). In rail mode the gear toggle still opens and closes the nested icons. Hide the chevron only by clipping; don't add state-specific selectors for it.
- Under `@media (pointer: coarse)`, nav links and the toggle get `min-block-size: 2.75rem`.

### 2.5 Copy for the toggle label

New slug `admin.nav.toggle` (global scope, no entity): en `Navigation menu`, fr `Menu de navigation`. Other locales fall back.

- Add it to `supabase/seeds/00-base-navigation.sql`, following that file's existing pattern exactly. Add `('admin.nav.toggle', null, null)` to the `local_text_link` insert, and the two `local_text` value rows.
- `supabase/seed.sql` contains a concatenated copy of that file, in the section headed `-- 00-base-navigation.sql (appended by sveltebuilder sync:supabase)` (around line 308). Make the **identical** edit there by hand. Do not run any `sveltebuilder sync` command.
- Apply it to the running database **without resetting**. Write just those two insert statements to a temporary file in your scratchpad, then run `pnpm exec supabase db query --local -f <that file>`. **Never `--linked`.**

### 2.6 Extend the screenshot script

Add `--open-navigation`. After load, click `button[aria-controls="admin-navigation-list"]`, wait 300ms, and save with the suffix `--navigation-open`. Skip the overflow check for those shots, since the overlay is meant to sit over content.

### Stage 2 verification

- [ ] `pnpm check` matches the baseline. Any new `svelte-ignore` must carry an explanatory comment.
- [ ] `pnpm screenshot --label stage-2`, and Read the dashboard shots for every viewport:
  - phone/tablet: rail, icons only, content starts right of the rail;
  - laptop (1024) and desktop: expanded, with labels.
- [ ] `pnpm screenshot --label stage-2-open --open-navigation --viewport phone --viewport desktop`:
  - phone: the expanded panel overlays the content, a scrim is visible, and the content behind has not moved;
  - desktop: the nav is collapsed to the rail (the toggle inverts the default) and the content has widened.
- [ ] Write a short throwaway Playwright check in your scratchpad, not the repo, at `phone`. Open the nav, press `Escape`, and assert `aria-expanded="false"` and that focus is on the toggle. Open it, click a nav link, and assert it is closed on the new page.
- [ ] Set the `locale` cookie to `ar` in a throwaway check, screenshot phone and desktop, and confirm the rail sits on the **right** with its border on the content side.
- [ ] The toggle's accessible name is "Navigation menu", not a `[missing: …]` sentinel.
- [ ] Commit.

---

## Stage 3: global form and touch fixes

Unlayered rules at the end of `src/app.css`, in their own commented section. They must be unlayered, because coreui's `components` layer sets the sizes being overridden.

1. **Stop iOS zooming the page on focus.** iOS zooms whenever a focused field is under 16px. Under `@media (pointer: coarse)`, set `font-size: 1rem` on `.input`, `.textarea`, `.select-trigger`, and native `select` elements, including their `.sm` variants.

That is the whole stage. Do not restyle anything else here.

### Stage 3 verification

- [ ] `pnpm check` matches the baseline.
- [ ] In a throwaway Playwright check at `phone`, the computed `font-size` of the headline input on the article editor is `16px`. At `desktop`, it is unchanged from before (`14px`).
- [ ] Commit.

---

## Stage 4: per-page fixes

Each item is small and self-contained. **If `before/report.json` shows no overflow for a page and the phone screenshot looks fine, skip it.** Don't churn working code.

| # | File | Change |
|---|---|---|
| 4a | `admin/dashboard/+page.svelte` | `.dashboard__stats`: `minmax(min(100%, 9rem), 1fr)` so phones show 2 stat cards per row instead of 1. `.dashboard__section-header`: add `gap: 0.75rem; flex-wrap: wrap`. |
| 4b | `admin/content/board/+page.svelte` | Keep the horizontally scrolling columns (that is the right pattern for a board on a phone). `.board__columns`: `grid-auto-columns: minmax(min(15rem, 85%), 1fr)` so the next column peeks in, plus `scroll-snap-type: x proximity`. `.board__column`: `scroll-snap-align: start`. `.board__card-actions`: `flex-wrap: wrap`. |
| 4c | `admin/content/article/[id]/+page.svelte` | Replace `@media (max-width: 60rem)` with a **container query**, so the two-column layout responds to the space actually available, which now depends on the nav state. Set `container-type: inline-size` on `.admin-article`, then `@container (width < 46rem) { .admin-article__columns { grid-template-columns: 1fr; } }`. `.admin-article__slug`: `flex-wrap: wrap`, and the `code` inside gets `overflow-wrap: anywhere`. `.admin-article__section`: `padding: 1rem` below 48rem. `.admin-article__block-head`: `flex-wrap: wrap`. **Do not** reorder the main and side columns. |
| 4d | `admin/content/comment/+page.svelte` | `.moderation__email` and `.moderation__body`: `overflow-wrap: anywhere` (long emails and URLs). `.moderation__actions`: `flex-wrap: wrap`. |
| 4e | `admin/page-view/+page.svelte` | `.page-view__windows`: `flex-wrap: wrap`. |
| 4f | `admin/local-text/+page.svelte`, `admin/locale/+page.svelte`, `admin/navigation-item/+page.svelte` | The `__add` section: `padding: var(--space-4)` below 48rem. `local-text`: `.local-text-admin__locales` becomes `minmax(min(100%, 16rem), 1fr)`. |
| 4g | `admin/navigation-item/+page.svelte` and `admin/navigation-item/[id]/+page.svelte` | `__form-row` (`2fr 1fr 1fr`): a single column below 40rem. |
| 4h | `admin/local-text/[id]/+page.svelte`, `admin/navigation-item/[id]/+page.svelte` | `__meta code`: `overflow-wrap: anywhere`. |

**Tables** (dashboard, page-view, user, local-text, locale, navigation-item, the article list) already scroll horizontally inside coreui's `.table-wrap`. That is acceptable. **Do not** turn tables into card layouts, and do not remove the pages' redundant `__table-wrap` wrappers.

### Stage 4 verification

- [ ] `pnpm check` matches the baseline.
- [ ] `pnpm screenshot --label after`. Every route at `phone` and `tablet` reports **0 overflow px**, unless the only offenders are inside a scroll container. If one doesn't, either fix it within the scope rules or list it for the report.
- [ ] Read the phone screenshots of every route touched in this stage, plus the desktop screenshots of the article editor and the board, to confirm desktop did not regress.
- [ ] Commit.

---

## Stage 5: report

Don't commit this report. Reply to the operator with:

1. **Overflow table:** `before` vs. `after` overflow px per route at `phone` and `tablet`, taken from the two `report.json` files.
2. **Per stage:** what changed, in one or two lines each, and any deviation from this plan, with the reason.
3. **Which authentication approach the screenshot script uses** (minted session or the `--login` fallback).
4. **Deferred items:** anything you noticed but did not do because it was out of scope.
5. Visible desktop changes the operator should know about. At minimum: the five pages that lost their extra padding, and the admin title moving to the header.

---

## Explicitly out of scope

- Persisting the nav preference (a later follow-up: a cookie read in `+layout.server.ts`, so SSR renders the saved state).
- Card or stacked layouts for tables.
- Reordering the article editor's columns, or any change to how story editing works.
- Tooltips on rail icons.
- Any change in `node_modules/` or coreui, new shared components, or schema/migration changes. The only database change is the seed copy in 2.5.
- Public site, sign-in, sign-out.
- The pre-existing `svelte-check` warnings. Note: `.local-text-admin__content-cell` is passed as a `class` to coreui's `TableCell`, so the scoped style never applies. That is a real bug, but not this task's.

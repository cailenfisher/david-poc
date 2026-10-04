// Screenshots the /admin area at several viewports and reports horizontal overflow.
// Authenticates by minting a fresh local Supabase session (local stack only).
// Run with: pnpm screenshot --label <name> [--route <path>] [--viewport <name>]

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'
import type { Page } from 'playwright'

const BASE_URL = 'http://localhost:5173'
const OUTPUT_ROOT = '.screenshots'
const MAX_CAPTURE_HEIGHT = 8000

interface Viewport {
  name: string
  width: number
  height: number
  mobile: boolean
}

interface Shot {
  route: string
  viewport: string
  overflow: number
  offenders: string[]
  file: string
}

const VIEWPORTS: Viewport[] = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 820, height: 1180, mobile: true },
  { name: 'laptop', width: 1024, height: 768, mobile: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false }
]

const STATIC_ROUTES = [
  '/admin/dashboard',
  '/admin/content/board',
  '/admin/content/article',
  '/admin/content/comment',
  '/admin/page-view',
  '/admin/user',
  '/admin/local-text',
  '/admin/locale',
  '/admin/navigation-item'
]

const DETAIL_PARENTS = [
  '/admin/content/article',
  '/admin/local-text',
  '/admin/locale',
  '/admin/navigation-item'
]

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function parseArguments(argv: string[]) {
  const routes: string[] = []
  const viewports: string[] = []
  let label = 'current'
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--label') label = argv[++index] ?? fail('--label needs a value')
    else if (argument === '--route') routes.push(argv[++index] ?? fail('--route needs a value'))
    else if (argument === '--viewport') viewports.push(argv[++index] ?? fail('--viewport needs a value'))
    else fail(`Unknown argument: ${argument}`)
  }
  return { label, routes, viewports }
}

function parseEnvironmentText(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

async function mintSessionCookies(): Promise<{ name: string; value: string }[]> {
  const environment = parseEnvironmentText(readFileSync('.env', 'utf8'))
  const url = process.env.PUBLIC_SUPABASE_URL ?? environment.PUBLIC_SUPABASE_URL
  const publishableKey = environment.PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) fail('PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_PUBLISHABLE_KEY missing from .env')

  const host = new URL(url).hostname
  if (host !== 'localhost' && host !== '127.0.0.1') {
    fail(`Refusing to run: PUBLIC_SUPABASE_URL host "${host}" is not local.`)
  }

  const status = parseEnvironmentText(
    execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
  )
  const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY
  if (!secretKey) fail('Could not read the local Supabase secret key from `supabase status`.')

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let email = process.env.SCREENSHOT_EMAIL
  if (!email) {
    const { data: account, error } = await admin
      .from('user_account')
      .select('auth_user_id')
      .eq('admin', true)
      .eq('active', true)
      .order('id')
      .limit(1)
      .maybeSingle()
    if (error || !account) fail('No active admin user_account found.')
    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(account.auth_user_id)
    if (authError || !authUser.user?.email) fail('Could not resolve the admin account email.')
    email = authUser.user.email
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkError || !link.properties?.hashed_token) fail('Could not generate a magic link.')

  const jar = new Map<string, string>()
  const server = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value)
      }
    }
  })
  const { error: verifyError } = await server.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.properties.hashed_token
  })
  if (verifyError) fail(`verifyOtp failed: ${verifyError.message}`)

  return [...jar].map(([name, value]) => ({ name, value }))
}

function routeSlug(route: string): string {
  return route.replace(/^\//, '').replace(/\/\d+(?=\/|$)/g, '/id').replace(/\//g, '-')
}

async function measureOverflow(page: Page) {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth
    const offenders: string[] = []
    if (overflow > 0) {
      const insideScrollContainer = (element: Element) => {
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const value = getComputedStyle(ancestor).overflowX
          if (value === 'auto' || value === 'scroll' || value === 'hidden') return true
        }
        return false
      }
      for (const element of document.querySelectorAll('body *')) {
        if (offenders.length >= 5) break
        const right = element.getBoundingClientRect().right
        if (right > window.innerWidth + 1 && !insideScrollContainer(element)) {
          const classes = typeof element.className === 'string' ? element.className.trim().split(/\s+/).join('.') : ''
          offenders.push(`${element.tagName.toLowerCase()}${classes ? '.' + classes : ''} @${Math.round(right)}px`)
        }
      }
    }
    return { overflow, offenders }
  })
}

// Headless Chromium occasionally fails a full-page capture on long pages; a retry clears it.
async function captureWithRetry(page: Page, file: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      // Very long pages (hundreds of table rows) exceed Chromium's capture limit at 2x scale.
      const { width, height } = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      }))
      const clip = { x: 0, y: 0, width, height: Math.min(height, MAX_CAPTURE_HEIGHT) }
      await page.screenshot({ path: file, fullPage: true, clip })
      return
    } catch (error) {
      if (attempt >= 3) throw error
      await page.waitForTimeout(500)
    }
  }
}

const options = parseArguments(process.argv.slice(2))
const selectedViewports = options.viewports.length
  ? VIEWPORTS.filter((viewport) => options.viewports.includes(viewport.name))
  : VIEWPORTS
if (!selectedViewports.length) fail('No matching viewports.')

const cookies = await mintSessionCookies()
const browser = await chromium.launch()
const shots: Shot[] = []

try {
  for (const viewport of selectedViewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      deviceScaleFactor: viewport.mobile ? 2 : 1
    })
    await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: BASE_URL })))
    const page = await context.newPage()

    let routes = options.routes
    if (!routes.length) {
      routes = [...STATIC_ROUTES]
      for (const parent of DETAIL_PARENTS) {
        const response = await page.goto(BASE_URL + parent, { waitUntil: 'networkidle' })
        if (page.url().includes('/sign-in') || response?.status() === 403) fail('authentication failed')
        const pattern = new RegExp(`^${parent}/\\d+$`)
        const hrefs = await page.$$eval('a[href]', (anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''))
        const detail = hrefs.find((href) => pattern.test(href))
        if (detail) routes.push(detail)
        else console.log(`skip: no detail route found under ${parent}`)
      }
    }

    for (const route of routes) {
      const response = await page.goto(BASE_URL + route, { waitUntil: 'networkidle' })
      if (page.url().includes('/sign-in') || response?.status() === 403) fail('authentication failed')

      const { overflow, offenders } = await measureOverflow(page)
      const file = join(OUTPUT_ROOT, options.label, viewport.name, `${routeSlug(route)}.png`)
      mkdirSync(dirname(file), { recursive: true })
      await captureWithRetry(page, file)
      shots.push({ route, viewport: viewport.name, overflow, offenders, file })
    }
    await context.close()
  }
} finally {
  await browser.close()
}

const reportFile = join(OUTPUT_ROOT, options.label, 'report.json')
mkdirSync(dirname(reportFile), { recursive: true })
writeFileSync(reportFile, JSON.stringify(shots, null, 2))

console.log('route'.padEnd(44) + 'viewport'.padEnd(26) + 'overflow'.padEnd(10) + 'offenders')
for (const shot of shots) {
  console.log(
    shot.route.padEnd(44) + shot.viewport.padEnd(26) + String(shot.overflow).padEnd(10) + shot.offenders.join('; ')
  )
}

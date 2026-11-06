// The public Doctors page (/app/doctors): node scripts/walk-doctors.mjs <outDir> [width...]
// Count matches GET /api/doctors, search, each filter, Show more, Book lands in booking, Back keeps filters,
// and the Doctors menu link from the homepage (phone menu at narrow widths) and from an /app page.
// BASE_URL as in the other walks (/, /app/ and /api on one origin). Prints "FAIL ..." and exits 1 on any failure.
import { launch } from './browser.mjs'
const [out = 'out', ...ws] = process.argv.slice(2)
const base = (process.env.BASE_URL ?? process.env.BASE ?? 'http://localhost:5180').replace(/\/(app\/?)?$/, '')
const { doctors, count } = await (await fetch(base + '/api/doctors')).json()
let failed = 0
// Polls until fn() returns want (React re-renders after each input), then returns the last value.
const until = async (fn, want) => { let v; for (let i = 0; i < 50; i++) { v = await fn(); if (v === want) break; await new Promise((r) => setTimeout(r, 100)) } return v }
const check = (ok, what, got = '') => { console.log(ok ? 'ok  ' : 'FAIL', what, got !== '' ? `(${got})` : ''); if (!ok) failed++ }
const b = await launch()
for (const width of (ws.length ? ws : ['390', '1280']).map(Number)) {
  console.log(`-- ${width}px`)
  const ctx = await b.newContext({ viewport: { width, height: width < 600 ? 844 : 860 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++ })
  const shot = (name) => p.screenshot({ path: `${out}/doctors-${name}-${width}.png`, fullPage: !['list', 'home-menu'].includes(name) })
  const status = async () => (await p.getByRole('status').filter({ hasText: /Showing|Loading/ }).textContent())?.trim()
  const count_ = async () => Number((await status()).match(/Showing (\d+)/)?.[1])
  const shown = (want) => until(count_, want)
  const cards = () => p.locator('ul[aria-label="Doctors"] > li')
  const pick = (label, value) => p.getByLabel(label, { exact: true }).selectOption(value)

  await p.goto(base + '/app/doctors')
  await p.getByText(/^Showing \d+/).waitFor()
  { const n = await shown(count); check(n === count, 'count matches the API', `${n} / ${count}`) }
  { const n = await until(() => cards().count(), Math.min(24, count)); check(n === Math.min(24, count), 'first batch is 24 cards', n) }
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  check(overflow <= 0, 'no horizontal overflow', overflow)
  await shot('list')

  await p.getByRole('button', { name: 'Show more doctors' }).click()
  { const n = await until(() => cards().count(), Math.min(48, count)); check(n === Math.min(48, count), 'Show more adds 24', n) }

  const first = doctors[0], surname = first.name.split(' ').at(-1)
  await p.getByLabel('Search by name').fill(surname)
  const bySearch = doctors.filter((d) => d.name.toLowerCase().includes(surname.toLowerCase())).length
  { const n = await shown(bySearch); check(n === bySearch && bySearch < count, `search "${surname}" narrows`, `${n} / ${bySearch}`) }
  await p.getByLabel('Search by name').fill('zzzz-nobody')
  check(await shown(0) === 0 && await p.getByRole('heading', { name: 'No doctors match' }).isVisible(), 'empty state when nothing matches')
  await shot('empty')
  await p.getByRole('button', { name: 'Clear filters' }).first().click()
  { const n = await shown(count); check(n === count, 'Clear filters shows everyone', n) }

  const group = doctors.at(-1).groupSlug
  await pick('Area of care', group)
  { const w = doctors.filter((d) => d.groupSlug === group).length, n = await shown(w); check(n === w && w < count, `area filter (${group})`, `${n} / ${w}`) }
  const spec = doctors.find((d) => d.groupSlug === group).specialty
  await pick('Specialty', spec)
  { const w = doctors.filter((d) => d.groupSlug === group && d.specialty === spec).length, n = await shown(w); check(n === w, `specialty filter (${spec})`, `${n} / ${w}`) }
  await p.getByRole('button', { name: 'Clear filters' }).first().click()
  await shown(count)
  await pick('Language', 'French')
  const fr = doctors.filter((d) => d.languages.split(' · ').includes('French')).length
  { const n = await shown(fr); check(n === fr && fr > 0 && fr < count, 'language filter (French)', `${n} / ${fr}`) }
  check(new URL(p.url()).searchParams.get('language') === 'French', 'filter is in the URL', new URL(p.url()).search)
  await shot('filtered')

  const card = cards().first()
  const name = (await card.getByRole('heading').textContent()).trim()
  await card.getByRole('link', { name: /^Book/ }).click()
  await p.waitForURL(/\/app\/book\/doctors\/\d+\/times/)
  await p.locator('h1').first().waitFor()
  check((await p.locator('main').innerText()).includes(name), `Book opens ${name}'s times`, new URL(p.url()).pathname)
  await shot('book')
  await p.goBack()
  await p.getByText(/^Showing \d+/).waitFor()
  check(await p.getByLabel('Language', { exact: true }).inputValue() === 'French' && await shown(fr) === fr, 'Back keeps the filter')

  // Menus: the /app header link, then the homepage menu (opened with its toggle).
  await p.goto(base + '/app/book')
  await p.locator('header').getByRole('link', { name: 'Doctors', exact: true }).click()
  await p.waitForURL(/\/app\/doctors$/)
  check(true, 'header Doctors link from /app/book')
  await p.goto((process.env.HOME_URL ?? base) + '/'); await p.waitForLoadState('networkidle')
  const menuLink = p.locator('nav[aria-label="Main navigation"] a', { hasText: /^Doctors/ })
  if (!(await menuLink.isVisible())) await p.locator('.menu-toggle').first().click()
  await menuLink.waitFor({ state: 'visible' })
  await p.waitForTimeout(700) // the menu's open animation
  await shot('home-menu')
  await menuLink.click()
  await p.waitForURL(/\/app\/doctors$/)
  await p.getByText(/^Showing \d+/).waitFor()
  check(true, 'homepage menu Doctors link')
  await ctx.close()
}
await b.close()
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)

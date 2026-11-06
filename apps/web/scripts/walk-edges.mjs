// Off-script checks against a running site: node scripts/walk-edges.mjs <outDir> [width]
// Homepage deep links, back/forward and refresh mid-booking, sign-out, 404s and the admin desk.
// Needs /app/, /admin/ and /api on one origin (BASE_URL, e.g. https://carevia.triplelabs.dev).
// HOME_URL (default BASE_URL) is the homepage to test; its /app links are followed on BASE_URL.
// Prints "FAIL ..." for every broken expectation and exits 1 if there was one.
import { launch } from './browser.mjs'
const [out, w = '1280'] = process.argv.slice(2)
const width = Number(w)
const base = (process.env.BASE_URL ?? process.env.BASE ?? 'http://localhost:5180').replace(/\/(app\/?)?$/, '')
const b = await launch()
const ctx = await b.newContext({ viewport: { width, height: width < 600 ? 844 : 860 }, reducedMotion: 'reduce' })
const p = await ctx.newPage()
p.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
p.on('response', async (r) => { if (r.url().includes('/api/') && r.status() >= 400) console.log('     api', r.status(), r.request().method(), new URL(r.url()).pathname, (await r.text().catch(() => '')).slice(0, 120)) })
let n = 0, failed = 0
const shot = async (name) => { await p.waitForTimeout(500); await p.screenshot({ path: `${out}/e${String(++n).padStart(2, '0')}-${name}-${width}.png`, fullPage: true }) }
const h1 = async () => (await p.locator('h1').first().textContent({ timeout: 8000 }).catch(() => ''))?.trim()
const check = (ok, what, got = '') => { console.log(ok ? 'ok  ' : 'FAIL', what, got ? `(${got})` : ''); if (!ok) failed++ }
const path = () => { const u = new URL(p.url()); return u.pathname + u.search }
const home = async () => { await p.goto((process.env.HOME_URL ?? base) + '/'); await p.waitForLoadState('networkidle') }
// Reads the link's href, then opens it on BASE_URL (the homepage may be a local build).
const follow = async (link) => { const href = await link.getAttribute('href'); await p.goto(base + href); await p.waitForLoadState('networkidle'); return href }
process.on('uncaughtException', async (e) => { console.log('CRASH', e.message.split('\n')[0], 'at', p.url()); await p.screenshot({ path: `${out}/crash-${width}.png`, fullPage: true }).catch(() => {}); console.log((await p.locator('main').innerText().catch(() => '')).slice(0, 600)); process.exit(1) })
const sleep = (s) => p.waitForTimeout(s * 1000) // sign-in is limited to 3 per 10 s per IP

// 1. Homepage deep links.
await home()
// Service cards link straight to booking: no details popup in between.
const book = p.locator('.treatment-card a.care-open[href*="service=mental"]').first()
check(await book.getAttribute('href') === '/app/book?service=mental', 'Mental health card links to /app/book?service=mental', await book.getAttribute('href'))
await follow(book)
check(await h1() === 'Choose who cares for you' && /group=mental/.test(path()), 'Book {service} opens the doctors for that area', `${path()} · ${await h1()}`); await shot('home-book-service')
for (const [name, want, heading] of [
  ['Create your account', /^\/app\/signup$/, 'Create your account'],
  ['Sign in', /^\/app\/signin$/, 'Sign in'],
]) {
  await home()
  const link = p.getByRole('link', { name, exact: true }).first()
  if (width < 600 && !(await link.isVisible())) await p.getByRole('button', { name: 'Open menu' }).click().catch(() => {})
  await follow(link)
  check(want.test(path()) && (await h1()) === heading, `homepage "${name}" opens ${want}`, `${path()} · ${await h1()}`)
}
for (const slug of ['general', 'mental', 'nutrition', 'specialist', 'certificates', 'treatments', 'renewals', 'bogus']) {
  await p.goto(`${base}/app/book?service=${slug}`); await p.waitForLoadState('networkidle'); await p.waitForTimeout(300)
  console.log('     /book', slug, '->', path(), '·', await h1())
  if (slug === 'certificates' || slug === 'renewals') check(await p.getByText(/doesn’t guarantee a certificate/).isVisible(), `${slug} says booking doesn’t guarantee a document`)
}
await shot('book-unknown-service')

// 2. Back and forward through booking, then a refresh on the times and checkout.
await p.goto(base + '/app/book')
// Each area is a plate; its services and the area's doctors open under "See N services".
const plate = p.locator('#plate-general'); await plate.getByRole('button', { name: /^See \d+ services?/ }).click()
await plate.getByRole('link', { name: /^All .* doctors$/ }).click()
await p.waitForURL(/book\/doctors\?/); await p.getByLabel('Service', { exact: true }).selectOption({ label: 'Allergies' })
await p.locator('article a.chip').first().waitFor()
await p.getByRole('link', { name: /^More times/ }).first().click(); await p.waitForURL(/\/times/)
await p.goBack(); await p.waitForURL(/book\/doctors\?/)
check((await p.getByLabel('Service', { exact: true }).locator('option:checked').textContent()) === 'Allergies', 'Back to the doctors keeps the chosen service', path())
await p.goBack(); await p.waitForURL(/book$/)
check((await h1()).includes('Know which care you need'), 'Back again returns to the services home', await h1())
await p.goForward(); await p.goForward(); await p.waitForURL(/\/times/)
check((await h1()) === 'Choose your appointment', 'Forward twice returns to the times', await h1())
// The third time, not the first: a demo reset books the patient a visit ~15 minutes from now, and the earliest
// free time can overlap it (409 TIME_CLASH). Times are 90 minutes apart, so the third is clear of it.
await p.locator('[role=radiogroup] [role=radio]').nth(2).click()
await p.reload(); await p.waitForLoadState('networkidle')
check((await h1()) === 'Choose your appointment', 'Refresh on the times stays there', path())
await p.locator('[role=radiogroup] [role=radio]').nth(2).click()
await p.getByRole('button', { name: 'Continue' }).click(); await p.waitForURL(/checkout/)
const held = p.getByText('Held for you').first()
check(await held.waitFor({ timeout: 5000 }).then(() => true, () => false), 'Checkout shows the held time and timer')
await p.reload(); await p.waitForLoadState('networkidle')
check((await h1()) === 'Confirm your visit' && await held.isVisible(), 'Refresh on checkout keeps the held time', `${path()} · ${await h1()}`); await shot('refresh-checkout')
await p.goBack(); await p.waitForURL(/\/times/); await p.waitForTimeout(800)
check((await h1()) === 'Choose your appointment', 'Back from checkout returns to the times', await h1()); await shot('back-to-times-with-hold')
await p.goForward(); await p.waitForURL(/checkout/)
await sleep(4)
await p.getByRole('button', { name: 'I already have an account' }).click()
await p.fill('input[name=email]', 'patient@example.com'); await p.fill('input[name=password]', 'demo-password')
await p.getByLabel('I’ll be in mainland Portugal during the visit.').check()
await p.getByLabel('I’ve read these terms. I agree to a video consultation on them.').check()
const pay = p.getByRole('button', { name: /^Pay €\d+ \(demo\)$/ })
await pay.click(); await p.waitForURL(/visits\//, { timeout: 20000 })
const visit = path()
await p.goBack(); await p.waitForTimeout(1200)
check(!/checkout/.test(p.url()), 'Back after paying skips the paid checkout', `${path()} · ${await h1()}`); await shot('back-after-pay')
check(!(await pay.isVisible().catch(() => false)), 'Back after paying does not offer to pay again')

// 3. 404s and a visit that isn't yours.
for (const bad of ['/app/nope', '/app/visits/not-a-real-id', '/app/doctor', ...(process.env.HOME_URL ? [] : ['/nope'])]) {
  const r = await p.goto(base + bad); await p.waitForTimeout(800)
  console.log('     ', bad, '->', r?.status(), path(), '·', await h1()); await shot('404' + bad.replace(/\//g, '_'))
}
await p.goto(base + '/app/visits/not-a-real-id'); await p.waitForLoadState('networkidle')
check((await h1()) === 'We couldn’t find this visit' && await p.getByRole('link', { name: 'Go to your appointments' }).getAttribute('href') === '/app/appointments', 'An unknown visit links back to the appointments list', await h1())

// 4. Sign out, then the back button and a private URL.
await p.goto(base + '/app/account/profile'); await p.getByRole('button', { name: 'Sign out' }).first().click(); await p.waitForURL(/signin/)
await p.goBack(); await p.waitForTimeout(1000)
check(!/Demo Patient/.test(await p.locator('main').textContent().catch(() => '') ?? ''), 'Back after sign-out shows no account data', path())
await p.goto(base + visit); await p.waitForTimeout(1000)
check(/signin/.test(p.url()), 'A visit URL after sign-out asks to sign in', path()); await shot('after-signout')

// 5. Admin desk (ADMIN=0 skips it, e.g. against the web dev server).
if (process.env.ADMIN !== '0') {
await sleep(6)
await p.goto(base + '/admin/'); await p.waitForLoadState('networkidle'); await shot('admin-login')
await p.fill('input[name=email]', 'admin@carevia.test'); await p.fill('input[name=password]', 'admin-demo-password')
await p.getByRole('button', { name: /^Sign in/ }).click(); await p.waitForTimeout(2500); await shot('admin-appointments')
const desk = (await p.locator('body').textContent()) ?? ''
check(!/example\.com|\+351|1990-01-01|Demo Patient/.test(desk), 'Admin list shows no patient name, email, phone or birth date')
await p.getByRole('button', { name: /video|daily/i }).first().click().catch(() => {}); await p.waitForTimeout(800); await shot('admin-daily')
await p.getByRole('button', { name: 'Sign out' }).first().click(); await p.waitForTimeout(800)
}
await b.close()
console.log(failed ? `${failed} failed` : 'all ok')
process.exit(failed ? 1 : 0)

// Booking walk (the wireframe's service flow): BASE_URL=http://localhost:5180 node scripts/walk-booking.mjs <outDir> [width...]
// Per width: search and filters; old /book redirects; (a) the demo patient books signed in, counting clicks; (b) a new patient signs up
// at checkout; (c) someone else holds the chosen time first (SLOT_TAKEN); (d) the demo patient books for their child. Needs the API in demo mode.
// On localhost (or RESET=1) it resets the demo first, so earlier runs' bookings don't clash.
import { mkdirSync } from 'node:fs'
import { launch } from './browser.mjs'

const [out = 'out', ...ws] = process.argv.slice(2)
const widths = (ws.length ? ws : ['390', '1280']).map(Number)
const base = (process.env.BASE_URL ?? 'http://localhost:5180').replace(/\/(app\/?)?$/, '')
mkdirSync(out, { recursive: true })
let failed = 0
const check = (ok, what, got = '') => { console.log(ok ? 'ok  ' : 'FAIL', what, got !== '' ? `(${got})` : ''); if (!ok) failed++ }

const b = await launch()
if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base) || process.env.RESET === '1') {
  const admin = await b.newContext({ extraHTTPHeaders: { Origin: base } })
  await admin.request.post(`${base}/api/auth/sign-in/email`, { data: { email: 'admin@carevia.test', password: process.env.DEMO_ADMIN_PASSWORD } })
  check((await admin.request.post(`${base}/api/demo/reset`, { data: {} })).ok(), 'Demo reset before the walk')
  await admin.close()
}
async function page(width) {
  const ctx = await b.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  p.on('response', async (r) => { if (r.url().includes('/api/') && r.status() >= 400) console.log('  api', r.status(), r.request().method(), new URL(r.url()).pathname, (await r.text().catch(() => '')).slice(0, 100)) })
  p.on('pageerror', (e) => { console.log('  pageerror', e.message); failed++ })
  return p
}
const noOverflow = async (p, what) => check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${what}: no sideways scroll`)
const heading = (p, name) => p.getByRole('heading', { level: 1, name }).waitFor()
const times = (p) => p.locator('[role=radiogroup] [role=radio]')

/** Services home > area > a time on a doctor card > Continue. Returns the clicks made. */
async function toCheckout(p, { width, area = 'General & urgent care', shots = false, timeIndex = 0 }) {
  let clicks = 0
  const click = async (l) => { await l.click(); clicks++ }
  await p.goto(base + '/app/book')
  const card = p.getByRole('list', { name: 'Areas of care' }).getByRole('link', { name: new RegExp(area) })
  await card.waitFor()
  if (shots) {
    await noOverflow(p, 'services home'); await p.screenshot({ path: `${out}/v2-1-services-${width}.png`, fullPage: true })
  }
  await click(card)
  await heading(p, 'Choose who cares for you')
  await p.locator('article a.chip').first().waitFor()
  if (shots) { await noOverflow(p, 'doctors'); await p.screenshot({ path: `${out}/v2-2-doctors-${width}.png` }) }
  // A time on a doctor card opens that doctor's times with it already chosen.
  const cardTime = p.locator('article a.chip').nth(timeIndex)
  const label = (await cardTime.textContent()).replace(/ with .*/, '')
  await click(cardTime)
  await heading(p, 'Choose your appointment')
  await times(p).first().waitFor()
  check(/\d\d:\d\d/.test(await p.locator('[role=radio][aria-checked=true]').first().textContent().catch(() => '')), `The tapped time (${label}) arrives chosen`)
  if (shots) { await noOverflow(p, 'times'); await p.screenshot({ path: `${out}/v2-3-times-${width}.png`, fullPage: true }) }
  await click(p.getByRole('button', { name: 'Continue' }))
  await heading(p, 'Confirm your visit')
  return clicks
}
async function pay(p, self = true) {
  await p.getByLabel(self ? 'I’ll be in mainland Portugal during the visit.' : 'We’ll both be in mainland Portugal during the visit.').click()
  await p.getByLabel(self ? 'I’ve read these terms. I agree to a video consultation on them.' : 'I’ve read these terms. I agree to a video consultation on them, on their behalf.').click()
  await p.getByRole('button', { name: /^Pay €\d+ \(demo\)$/ }).click()
  return 3
}

for (const width of widths) {
  console.log(`-- ${width}px`)

  // Search narrows the areas and opens the matching service; filters and the doctor profile work.
  {
    const p = await page(width)
    await p.goto(base + '/app/book')
    await p.getByLabel('Search services').fill('migraine')
    const cards = p.getByRole('list', { name: 'Areas of care' }).getByRole('link')
    check(await cards.count() === 1 && /Matches: Migraine/.test(await cards.first().textContent()), 'Search "migraine" finds Specialist care, Migraine', await cards.count())
    await cards.first().click(); await heading(p, 'Choose who cares for you')
    check(await p.getByLabel('Service').locator('option:checked').textContent() === 'Migraine', 'The search result opens that service')
    await p.getByLabel('Price', { exact: true }).selectOption('60')
    check(!(await p.getByLabel('Specialty').count()), 'Specialty and availability start folded')
    await p.getByRole('button', { name: 'More filters' }).click()
    check(await p.getByLabel('Specialty').isVisible() && await p.getByLabel('Availability').isVisible(), 'More filters shows specialty and availability')
    await p.getByRole('status').filter({ hasText: /doctors? for Migraine/ }).waitFor()
    check(await p.getByRole('article').count() >= 1, 'The price filter keeps the €45 doctors', await p.getByRole('article').count())
    await p.getByRole('link', { name: /^Profile/ }).first().click()
    await p.getByText('Professional registration').waitFor()
    check(await p.getByText(/Ordem dos Médicos cédula/).isVisible(), 'Doctor profile shows the cédula')
    await noOverflow(p, 'doctor profile'); await p.screenshot({ path: `${out}/v2-doctor-profile-${width}.png` })
    await p.context().close()
  }

  // (a) signed in.
  {
    const p = await page(width)
    await p.goto(base + '/app/signin')
    await p.getByLabel('Email').fill('patient@example.com'); await p.getByLabel('Password').fill('demo-password')
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(/\/app\/account/)
    check(await p.getByRole('link', { name: 'Book new care' }).first().getAttribute('href') === '/app/book', 'Account “Book new care” opens booking')
    let clicks = 0
    // The demo patient may already have a visit at a time (TIME_CLASH): check the message, then try the next time.
    for (let i = 0; ; i++) {
      clicks = await toCheckout(p, { width, shots: i === 0, timeIndex: i })
      if (i === 0) {
        check(!(await p.getByLabel('First name').count()), 'Signed in: no details form')
        check(!(await p.getByRole('checkbox').first().isChecked()), 'Nothing pre-ticked')
        await noOverflow(p, 'checkout signed in'); await p.screenshot({ path: `${out}/v2-4-checkout-signed-in-${width}.png`, fullPage: true })
      }
      clicks += await pay(p)
      const clash = p.getByText('There’s already a visit for this person at this time.')
      const outcome = await Promise.race([p.waitForURL(/\/app\/visits\/[^/]+\?booked=1/, { timeout: 15000 }).then(() => 'booked'), clash.waitFor({ timeout: 15000 }).then(() => 'clash')])
      if (outcome === 'booked') break
      await p.screenshot({ path: `${out}/v2-time-clash-${width}.png`, fullPage: true })
      await p.getByRole('button', { name: 'Choose another time' }).last().click()
      await heading(p, 'Choose your appointment')
      check(true, 'TIME_CLASH: message, then Choose another time returns to the doctor’s times')
    }
    check(true, `(a) signed-in booking lands on the visit page in ${clicks} clicks`, clicks)
    await p.screenshot({ path: `${out}/v2-5-booked-${width}.png` })

    // (d) the same patient books for their child (an old /book?service= link redirects to the doctors).
    await p.goto(base + '/app/book?service=general')
    await heading(p, 'Choose who cares for you')
    check(/book\/doctors\?group=general/.test(p.url()), 'Old /book?service= link opens the doctors', p.url().replace(base, ''))
    await p.locator('article a.chip').last().click()
    await heading(p, 'Choose your appointment')
    await p.getByLabel(/^My child/).check()
    await p.getByRole('button', { name: 'Continue' }).click()
    await heading(p, 'Confirm your visit')
    await p.getByRole('heading', { name: 'Which child is this for?' }).waitFor()
    check(await p.getByRole('radio', { name: /Leo Patient/ }).isChecked(), 'Saved child is chosen at checkout')
    await noOverflow(p, 'checkout for a child'); await p.screenshot({ path: `${out}/v2-6-checkout-child-${width}.png`, fullPage: true })
    await pay(p, false)
    await p.waitForURL(/\/app\/visits\/[^/]+\?booked=1/, { timeout: 15000 })
    check(await p.getByText('Leo Patient').first().waitFor().then(() => true, () => false), '(d) booking for the child lands on their visit, for Leo Patient')
    await p.context().close()
  }

  // Old links redirect: the step-by-step flow's screens and /services-v2.
  {
    const p = await page(width)
    for (const [from, want] of [['/app/book/pay', /\/app\/book$/], ['/app/book/time', /\/app\/book$/], ['/app/services-v2/doctors?group=mental', /\/app\/book\/doctors\?group=mental$/], ['/app/book?service=mental&doctor=3', /\/app\/book\/doctors\/3\/times$/]]) {
      await p.goto(base + from); await p.waitForURL(want, { timeout: 10000 }).catch(() => {})
      check(want.test(p.url()), `${from} redirects`, p.url().replace(base, ''))
    }
    await p.context().close()
  }

  // (b) new patient, signed out.
  {
    const p = await page(width)
    let clicks = await toCheckout(p, { width, area: 'Mental health' })
    await p.getByRole('button', { name: /^Pay / }).click()
    check(await p.getByText('Enter your first name.').isVisible(), 'Empty submit shows field errors')
    check(!(await p.getByLabel(/Sex|Número de Utente|NIF|Address/i).count()), 'No sex, utente, NIF or address fields')
    await p.getByLabel('First name').fill('Ana'); await p.getByLabel('Last name').fill('Walker')
    await p.getByLabel('Email').fill(`v2-${Date.now()}-${width}@example.com`); await p.getByLabel('Mobile number').fill('912 345 678')
    await p.getByLabel('Date of birth').fill('1988-04-02'); await p.getByLabel('Password').fill('a-long-demo-pass-2026')
    check(!(await p.getByText('Enter your first name.').count()), 'Errors clear as fields are filled')
    await noOverflow(p, 'checkout signed out'); await p.screenshot({ path: `${out}/v2-4-checkout-new-${width}.png`, fullPage: true })
    clicks += await pay(p)
    await p.waitForURL(/\/app\/visits\/[^/]+\?booked=1/, { timeout: 20000 })
    check(true, `(b) new-patient booking lands on the visit page in ${clicks} clicks and 6 fields`, clicks)
    await p.context().close()
  }

  // (c) someone else holds the chosen time before Continue.
  {
    const p = await page(width)
    await p.goto(base + '/app/book/doctors?group=general&service=7')
    await p.getByRole('link', { name: /^More times/ }).first().click()
    await heading(p, 'Choose your appointment')
    const doctorId = p.url().match(/doctors\/(\d+)\/times/)[1]
    await times(p).first().click()
    const { slots } = await (await p.request.get(`${base}/api/doctors/${doctorId}/slots?days=21`)).json()
    const other = await b.newContext()
    const r = await other.request.post(`${base}/api/bookings`, { headers: { Origin: base }, data: { slotId: slots[0].id, serviceId: 7, channel: 'video', for: 'self', inMainlandPortugal: true } })
    check(r.status() === 201, 'Another browser holds that time', r.status())
    await p.getByRole('button', { name: 'Continue' }).click()
    const msg = p.getByText('Someone has just booked that time.').filter({ visible: true })
    await msg.waitFor()
    check(await msg.isVisible(), '(c) SLOT_TAKEN shows a clear message beside Continue')
    check(!(await p.locator('[role=radio][aria-checked=true]').count()), 'The taken time is unselected and the times reload')
    await p.screenshot({ path: `${out}/v2-slot-taken-${width}.png` })
    await times(p).first().click(); await p.getByRole('button', { name: 'Continue' }).click()
    await heading(p, 'Confirm your visit')
    check(true, 'Another time can be held straight after')
    await other.close(); await p.context().close()
  }
}
await b.close()
console.log(failed ? `${failed} failed` : 'all ok')
process.exit(failed ? 1 : 0)

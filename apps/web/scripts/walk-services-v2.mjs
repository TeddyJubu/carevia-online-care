// Services v2 walk: BASE_URL=http://localhost:5180 node scripts/walk-services-v2.mjs <outDir> [width...]
// Per width: (a) the demo patient books signed in, counting clicks; (b) a new patient signs up at checkout;
// (c) someone else holds the time first (SLOT_TAKEN), then the patient picks another. Needs the API in demo mode.
// On localhost (or RESET=1) it resets the demo first; the second width then meets TIME_CLASH on the first time.
import { mkdirSync } from 'node:fs'
import { launch } from './browser.mjs'

const [out = 'out', ...ws] = process.argv.slice(2)
const widths = (ws.length ? ws : ['390', '1280']).map(Number)
const base = (process.env.BASE_URL ?? 'http://localhost:5180').replace(/\/(app\/?)?$/, '')
mkdirSync(out, { recursive: true })
let failed = 0
const check = (ok, what, got = '') => { console.log(ok ? 'ok  ' : 'FAIL', what, got !== '' ? `(${got})` : ''); if (!ok) failed++ }

const b = await launch()
// Local runs start from the seeded demo, so earlier walks' bookings don't clash. Never against another host.
if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base) || process.env.RESET === '1') {
  const admin = await b.newContext({ extraHTTPHeaders: { Origin: base } })
  await admin.request.post(`${base}/api/auth/sign-in/email`, { data: { email: 'admin@carevia.test', password: 'admin-demo-password' } })
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
const firstTime = (p, service) => p.getByRole('list', { name: `${service}, times` }).getByRole('button').first()
const noOverflow = async (p, what) => check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${what}: no sideways scroll`)

for (const width of widths) {
  console.log(`-- ${width}px`)

  // (a) signed in: time, mainland, consent, pay.
  {
    const p = await page(width)
    await p.goto(base + '/app/signin')
    await p.getByLabel('Email').fill('patient@example.com'); await p.getByLabel('Password').fill('demo-password')
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(/\/app\/account/)
    check(await p.getByRole('link', { name: 'Quick book' }).waitFor().then(() => true, () => false), 'Account links to Services v2')
    await p.goto(base + '/app/services-v2')
    let clicks = 0
    const click = async (l) => { await l.click(); clicks++ }
    // Third service: the demo patient's seeded visit can overlap the earliest general times (TIME_CLASH).
    const service = 'Adult check-up'
    await firstTime(p, service).waitFor()
    check(await p.getByText('Not an emergency service.').first().isVisible(), 'Emergency notice on the list')
    await noOverflow(p, 'list')
    await p.screenshot({ path: `${out}/v2-list-${width}.png`, fullPage: false })
    // The demo patient may already have a visit at a shown time (the seeded one, or an earlier walk): the API
    // refuses it with TIME_CLASH. Then check the message, choose another time and try the next one.
    // Rows in order; when all four times in a row clash, move to the next service.
    const rows = ['Adult check-up', 'Respiratory infections', 'Urinary infections', 'Skin consultation', 'Hair loss', 'Pain', 'Allergies']
    for (let i = 0; ; i++) {
      clicks = 0
      const row = rows[Math.floor(i / 4)]
      if (!row) throw new Error('Every tried time clashes with an existing visit; reset the demo')
      await p.getByRole('heading', { name: row, exact: true }).scrollIntoViewIfNeeded()
      const time = p.getByRole('list', { name: `${row}, times` }).getByRole('button').nth(i % 4)
      await time.waitFor()
      await click(time)
      await p.getByRole('heading', { name: 'Confirm your visit' }).waitFor()
      if (i === 0) {
        check(!(await p.getByLabel('First name').count()), 'Signed in: no details form')
        check(!(await p.getByRole('checkbox').first().isChecked()), 'Nothing pre-ticked')
        await noOverflow(p, 'checkout signed in')
        await p.screenshot({ path: `${out}/v2-checkout-signed-in-${width}.png`, fullPage: true })
      }
      await click(p.getByLabel('I’ll be in mainland Portugal during the visit.'))
      await click(p.getByLabel('I’ve read these terms. I agree to a video consultation on them.'))
      await click(p.getByRole('button', { name: /^Pay €\d+ \(demo\)$/ }))
      const clash = p.getByText('There’s already a visit for this person at this time.')
      const outcome = await Promise.race([p.waitForURL(/\/app\/visits\/[^/]+\?booked=1/, { timeout: 15000 }).then(() => 'booked'), clash.waitFor({ timeout: 15000 }).then(() => 'clash')])
      if (outcome === 'booked') break
      check(await p.getByRole('button', { name: 'Choose another time' }).last().isVisible(), 'TIME_CLASH: message and a way to choose another time')
      await p.screenshot({ path: `${out}/v2-time-clash-${width}.png`, fullPage: true })
      await p.getByRole('button', { name: 'Choose another time' }).last().click()
      await p.getByRole('heading', { name: 'Choose a time' }).waitFor()
    }
    check(true, `(a) signed-in booking lands on the visit page in ${clicks} clicks`, clicks)
    await p.screenshot({ path: `${out}/v2-booked-${width}.png` })
    await p.context().close()
  }

  // (b) new patient, signed out: time, five fields and a date, two boxes, pay.
  {
    const p = await page(width)
    await p.goto(base + '/app/services-v2')
    let clicks = 0
    const click = async (l) => { await l.click(); clicks++ }
    const service = 'Adult urgent care'
    await firstTime(p, service).waitFor()
    await click(firstTime(p, service))
    await p.getByRole('heading', { name: 'Confirm your visit' }).waitFor()
    // Empty submit: errors, nothing booked.
    await p.getByRole('button', { name: /^Pay / }).click()
    check(await p.getByText('Enter your first name.').isVisible(), 'Empty submit shows field errors')
    check(await p.getByText('Confirm you’ll be in mainland Portugal').isVisible(), 'Empty submit asks for mainland')
    check(!(await p.getByLabel(/Sex|Número de Utente|NIF|Address/i).count()), 'No sex, utente, NIF or address fields')
    await p.getByLabel('First name').fill('Ana'); await p.getByLabel('Last name').fill('Walker')
    await p.getByLabel('Email').fill(`v2-${Date.now()}-${width}@example.com`); await p.getByLabel('Mobile number').fill('912 345 678')
    await p.getByLabel('Date of birth').fill('1988-04-02'); await p.getByLabel('Password').fill('a-long-demo-pass-2026')
    await noOverflow(p, 'checkout signed out')
    await p.screenshot({ path: `${out}/v2-checkout-new-${width}.png`, fullPage: true })
    await click(p.getByLabel('I’ll be in mainland Portugal during the visit.'))
    await click(p.getByLabel('I’ve read these terms. I agree to a video consultation on them.'))
    await click(p.getByRole('button', { name: /^Pay €\d+ \(demo\)$/ }))
    await p.waitForURL(/\/app\/visits\/[^/]+\?booked=1/, { timeout: 20000 })
    check(true, `(b) new-patient booking lands on the visit page in ${clicks} clicks and 6 fields`, clicks)
    await p.context().close()
  }

  // (c) someone else holds the time between the list loading and the tap.
  {
    const p = await page(width)
    await p.goto(base + '/app/services-v2')
    const service = 'Skin consultation', serviceId = 7
    await p.getByRole('heading', { name: service, exact: true }).scrollIntoViewIfNeeded()
    const btn = firstTime(p, service)
    await btn.waitFor()
    const { slots } = await (await p.request.get(`${base}/api/slots/first-available?serviceId=${serviceId}&limit=1`)).json()
    const other = await b.newContext()
    const r = await other.request.post(`${base}/api/bookings`, { headers: { Origin: base }, data: { slotId: slots[0].id, serviceId, channel: 'video', for: 'self', inMainlandPortugal: true } })
    check(r.status() === 201, 'Another browser holds the first time', r.status())
    await btn.click()
    const msg = p.getByText('Someone has just booked that time.')
    await msg.waitFor()
    check(await msg.isVisible(), '(c) SLOT_TAKEN shows a clear message on the list')
    check(!(await p.getByRole('heading', { name: 'Confirm your visit' }).count()), 'Stays on the list to pick again')
    await firstTime(p, service).waitFor()
    await p.screenshot({ path: `${out}/v2-slot-taken-${width}.png` })
    await firstTime(p, service).click()
    await p.getByRole('heading', { name: 'Confirm your visit' }).waitFor()
    check(true, 'Another time can be held straight after')
    await p.getByRole('button', { name: 'Choose another time' }).first().click()
    await p.getByRole('heading', { name: 'Choose a time' }).waitFor()
    check(true, 'Choose another time returns to the list')
    await other.close(); await p.context().close()
  }
}
await b.close()
console.log(failed ? `${failed} failed` : 'all ok')
process.exit(failed ? 1 : 0)

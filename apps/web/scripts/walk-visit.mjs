// Visit and doctor screens with fake camera and microphone: node scripts/walk-visit.mjs <outDir> [width]
import { chromium } from 'playwright'
const [out, w = '1280'] = process.argv.slice(2)
const width = Number(w)
const base = process.env.BASE ?? 'http://localhost:5180'
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const ctx = await b.newContext({ viewport: { width, height: width < 600 ? 844 : 860 }, reducedMotion: 'reduce', permissions: ['camera', 'microphone'] })
const p = await ctx.newPage()
p.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
p.on('console', (m) => m.type() === 'error' && !/40\d|425|410/.test(m.text()) && console.log('CONSOLE', m.text()))
let n = 0
const shot = async (name) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/v${String(++n).padStart(2, '0')}-${name}-${width}.png`, fullPage: true }); console.log('shot', name, p.url()) }
const signIn = async (email, password) => {
  await p.goto(base + '/app/signin'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', password)
  await p.locator('form button.btn-primary').click(); await p.waitForURL((u) => !u.pathname.endsWith('/signin'))
}
// Against the real API: as admin, move today's demo visit to 5 minutes from now so the join window is open,
// then read the demo patient's appointment ids. The mock uses fixed ids instead.
const ids = { today: 'appt-today', child: 'appt-child', past: ['appt-past-1', 'appt-past-2'] }
const json = (path, method = 'GET', body) => p.evaluate(async ([path, method, body]) => {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  return r.json()
}, [path, method, body])
if (!process.env.MOCK) {
  await p.goto(base + '/app/signin')
  await json('/api/auth/sign-in/email', 'POST', { email: 'admin@carevia.test', password: 'admin-demo-password' })
  console.log('reset', JSON.stringify(await json('/api/demo/reset', 'POST', { startsInMinutes: 5 })))
  await json('/api/auth/sign-out', 'POST', {})
}
await signIn('patient@example.com', 'demo-password')
if (!process.env.MOCK) {
  const up = (await json('/api/appointments?scope=upcoming')).appointments
  const past = (await json('/api/appointments?scope=past')).appointments
  ids.today = up.find((a) => a.patient?.kind === 'self').id
  ids.child = up.find((a) => a.patient?.kind === 'family').id
  ids.past = past.filter((a) => a.outcome).map((a) => a.id)
}
const today = ids.today
await p.goto(`${base}/app/visits/${today}`); await shot('j7-prepare')
await p.fill('#q-new', 'How long will the cough last?'); await p.getByRole('button', { name: 'Add', exact: true }).click()
await p.goto(`${base}/app/visits/${today}/join`); await shot('j8-prejoin')
await p.getByRole('checkbox').nth(0).check(); await p.getByRole('checkbox').nth(1).check(); await p.getByRole('checkbox').nth(2).check()
await p.getByRole('button', { name: 'Continue to the waiting room' }).click(); await p.waitForURL(/waiting/); await p.waitForTimeout(1500); await shot('j9-waiting')
const join = p.getByRole('button', { name: 'Join the call' })
if (await join.isEnabled()) { await join.click(); await p.waitForURL(/call/); await p.waitForTimeout(4000); await shot('j10-call') }
else { await p.goto(`${base}/app/visits/${today}/call`); await p.waitForTimeout(3000); await shot('j10-call') }
await p.goto(`${base}/app/visits/${ids.child}`); await shot('j7-later')
await p.goto(`${base}/app/visits/${ids.child}/waiting`); await p.waitForTimeout(1200); await shot('j9-before')
for (const id of ids.past) { await p.goto(`${base}/app/visits/${id}/done`); await shot('j11-done') }
await p.goto(base + '/app/account/profile'); await p.getByRole('button', { name: 'Sign out' }).click(); await p.waitForURL(/signin/)
await signIn('doctor@carevia.test', 'doctor-demo-password')
await p.goto(base + '/app/doctor'); await shot('j13-agenda')
await p.locator('a.btn', { hasText: /Start visit|Open visit/ }).first().click(); await p.waitForURL(/doctor\/visits/); await shot('j13-visit')
const start = p.getByRole('button', { name: 'Start the call' })
if (await start.count()) { await start.click(); await p.waitForTimeout(3000); await shot('j13-call') }
await p.getByRole('button', { name: 'Completed' }).click(); await shot('j13-confirm')
await p.getByRole('button', { name: 'Record outcome' }).click(); await shot('j13-recorded')
await b.close()

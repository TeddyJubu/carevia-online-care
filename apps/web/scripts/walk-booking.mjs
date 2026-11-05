// Books a visit for a child, screenshotting each step: node scripts/walk-booking.mjs <outDir> [width]
// SIGNUP=1 creates a new account and adds a new child; otherwise it signs in as the demo patient and picks Leo.
import { chromium } from 'playwright'
const [out, w = '1280'] = process.argv.slice(2)
const width = Number(w)
const base = (process.env.BASE_URL ?? process.env.BASE ?? 'http://localhost:5180').replace(/\/(app\/?)?$/, '')
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width, height: width < 600 ? 844 : 860 }, reducedMotion: 'reduce' })).newPage()
p.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()))
let n = 0
const shot = async (name) => { await p.waitForTimeout(500); await p.screenshot({ path: `${out}/b${String(++n).padStart(2, '0')}-${name}-${width}.png`, fullPage: true }); console.log('shot', name, p.url()) }
await p.goto(base + '/app/book?service=general'); await shot('j1-service')
await p.getByRole('button', { name: 'Continue' }).click()
await p.getByLabel('My child').check(); await p.getByLabel('Yes, I’ll be in mainland Portugal').check(); await shot('j2-who')
await p.getByRole('button', { name: 'Continue' }).click()
await p.locator('[role=radiogroup] [role=radio]').first().waitFor(); await p.locator('[role=radiogroup] [role=radio]').first().click(); await shot('j3-time')
await p.getByRole('button', { name: /^Continue with/ }).click()
await p.getByRole('heading', { name: 'Create your account' }).waitFor(); await shot('j4-account')
if (process.env.SIGNUP) {
  const stamp = Date.now().toString(36)
  await p.fill('input[name=firstName]', 'Rita'); await p.fill('input[name=lastName]', 'Walker')
  await p.fill('input[name=email]', `walk-${stamp}@example.com`); await p.fill('input[name=phone]', '912 345 678')
  await p.fill('input[name=dateOfBirth]', '1986-04-12'); await p.fill('input[name=password]', `Cv-${stamp}-tide-lantern-58`)
  await p.getByRole('button', { name: 'Create account and continue' }).click()
  await p.waitForURL(/book\/family/); await p.locator('input[name=firstName]').waitFor()
  await p.fill('input[name=firstName]', 'Tomas'); await p.fill('input[name=lastName]', 'Walker'); await p.fill('input[name=dateOfBirth]', '2019-06-01')
} else {
  await p.getByRole('button', { name: 'Sign in instead' }).click()
  await p.fill('input[name=email]', 'patient@example.com'); await p.fill('input[name=password]', 'demo-password')
  await p.getByRole('button', { name: 'Sign in and continue' }).click()
  await p.waitForURL(/book\/family/)
}
await shot('j4b-family')
await p.getByRole('button', { name: 'Continue' }).click()
await p.waitForURL(/book\/consent/); await p.getByRole('checkbox').waitFor(); await shot('j5-consent')
await p.getByRole('checkbox').check(); await p.getByRole('button', { name: 'Agree and continue' }).click()
await p.waitForURL(/book\/pay/); await shot('j6-pay')
await p.getByRole('button', { name: /^Pay €\d+ \(demo\)$/ }).click()
await p.waitForURL(/visits\//); await shot('j7-booked')
await b.close()

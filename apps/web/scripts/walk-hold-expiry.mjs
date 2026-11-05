// Lets a hold expire on J4 (signed out), then tries to continue: node scripts/walk-hold-expiry.mjs <outDir> [width]
// Takes about 11 minutes: the API holds a slot for 10.
import { chromium } from 'playwright'
const [out, w = '390'] = process.argv.slice(2)
const width = Number(w)
const base = (process.env.BASE_URL ?? process.env.BASE ?? 'http://localhost:5180').replace(/\/(app\/?)?$/, '')
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width, height: width < 600 ? 844 : 860 }, reducedMotion: 'reduce' })).newPage()
p.on('response', async (r) => { if (r.url().includes('/api/') && r.status() >= 400) console.log('api', r.status(), r.request().method(), new URL(r.url()).pathname, (await r.text().catch(() => '')).slice(0, 120)) })
let failed = 0
const check = (ok, what, got = '') => { console.log(ok ? 'ok  ' : 'FAIL', what, got ? `(${got})` : ''); if (!ok) failed++ }
await p.goto(base + '/app/book?service=general'); await p.getByRole('button', { name: 'Continue' }).click()
await p.getByRole('radio', { name: /^Me / }).check(); await p.getByLabel('Yes, I’ll be in mainland Portugal').check()
await p.getByRole('button', { name: 'Continue' }).click()
const slot = p.locator('[role=radiogroup] [role=radio]').first(); await slot.click()
const slotText = await slot.textContent()
const hold = p.waitForResponse((r) => r.url().endsWith('/api/bookings') && r.request().method() === 'POST')
await p.getByRole('button', { name: /^Continue with/ }).click(); await p.waitForURL(/book\/account/)
const expiresAt = (await (await hold).json()).appointment.holdExpiresAt
console.log('held', slotText, 'until', expiresAt)
await p.waitForTimeout(Math.max(0, Date.parse(expiresAt) - Date.now()) + 5000)
const dialog = p.getByRole('dialog', { name: 'Your time was released' })
check(await dialog.isVisible(), 'The "time released" dialog opens when the hold runs out')
await p.screenshot({ path: `${out}/hold-expired-${width}.png`, fullPage: true })
// Signing in after expiry must not claim a dead hold.
await p.getByRole('button', { name: 'Choose a time again' }).click(); await p.waitForURL(/book\/time/)
check(true, 'Choose a time again returns to J3', p.url())
await p.locator('[role=radiogroup] [role=radio]').first().waitFor()
await p.screenshot({ path: `${out}/hold-expired-j3-${width}.png`, fullPage: true })
await b.close()
console.log(failed ? `${failed} failed` : 'all ok')
process.exit(failed ? 1 : 0)

// Reschedule screens against the running app: node scripts/walk-reschedule.mjs <outDir> [width]
// Needs DROPPED_ID: a demo-patient visit that is confirmed, ended_poor_quality, with its join window closed.
import { chromium } from 'playwright'
const [out, w = '1280'] = process.argv.slice(2)
const width = Number(w)
const base = process.env.BASE ?? 'http://localhost:5180'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width, height: width < 600 ? 844 : 860 }, reducedMotion: 'reduce' })).newPage()
p.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
let n = 0
const shot = async (name) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/r${n++}-${name}-${width}.png`, fullPage: true }); console.log('shot', name, p.url()) }
await p.goto(base + '/app/signin'); await p.fill('input[name=email]', 'patient@example.com'); await p.fill('input[name=password]', 'demo-password')
await p.locator('form button.btn-primary').click(); await p.waitForURL(/account/)
const up = await p.evaluate(() => fetch('/api/appointments?scope=upcoming').then((r) => r.json()))
const child = up.appointments.find((a) => a.patient?.kind === 'family')
await p.goto(`${base}/app/visits/${child.id}`); await shot('visit-with-change')
await p.getByRole('link', { name: 'Change the time' }).click(); await p.waitForURL(/reschedule/)
await p.locator('[role=radio]').first().waitFor(); await p.locator('[role=radio]').nth(1).click(); await shot('reschedule-picker')
await p.getByRole('button', { name: /^Move to/ }).click(); await p.waitForURL(/moved=1/); await shot('moved')
if (process.env.DROPPED_ID) {
  await p.goto(`${base}/app/visits/${process.env.DROPPED_ID}/done`); await shot('dropped-outside-window')
  await p.getByRole('link', { name: 'Choose a new time' }).click(); await p.waitForURL(/reschedule/); await p.locator('[role=radio]').first().waitFor(); await shot('dropped-reschedule')
}
await b.close()

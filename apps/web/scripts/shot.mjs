// Quick screenshots: node scripts/shot.mjs <outDir> <path> [path...]
// Env: BASE (default http://localhost:5180), LOGIN=email:password signs in first via the API.
import { chromium } from 'playwright'
const [out, ...paths] = process.argv.slice(2)
const base = (process.env.BASE_URL ?? process.env.BASE ?? 'http://localhost:5180').replace(/\/(app\/?)?$/, '')
const b = await chromium.launch()
for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 860 }, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
  p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()))
  await p.goto(base + '/app/signin')
  if (process.env.LOGIN) {
    const [email, password] = process.env.LOGIN.split(':')
    await p.fill('input[name=email]', email); await p.fill('input[name=password]', password)
    await p.click('button[type=submit], form button.btn-primary'); await p.waitForURL((u) => !u.pathname.endsWith('/signin'))
  }
  for (const path of paths) {
    await p.goto(base + '/app' + path); await p.waitForTimeout(900)
    const name = path.replace(/[/?=&]+/g, '_').replace(/^_|_$/g, '') || 'index'
    await p.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true })
  }
  await ctx.close()
}
await b.close()

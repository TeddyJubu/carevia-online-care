// Accessibility sweep: node scripts/a11y.mjs <outDir> [width...]
// On every app screen and the homepage: axe-core (WCAG 2.2 A and AA), horizontal overflow, focus visibility along
// the Tab order, and running animations under prefers-reduced-motion. Writes <outDir>/a11y-<width>.json.
// BASE_URL as in the walks; HOME_URL (default BASE_URL) for the homepage; ADMIN=0 skips /admin/.
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { launch } from './browser.mjs'
const [out, ...widths] = process.argv.slice(2)
const base = (process.env.BASE_URL ?? process.env.BASE ?? 'http://localhost:5180').replace(/\/(app\/?)?$/, '')
const home = process.env.HOME_URL ?? base
const axe = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const b = await launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function audit(p, name, width) {
  await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(600)
  await p.addScriptTag({ content: axe })
  const r = await p.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) }))
  })
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  // Animations still running with reduced motion on (the context sets prefers-reduced-motion: reduce).
  const motion = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && Number(a.effect?.getTiming().duration) > 50 && a.effect?.getTiming().iterations === Infinity).map((a) => a.animationName ?? a.constructor.name))
  // Tab through the page: every stop must show a focus indicator.
  const tabs = []
  await p.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
  for (let i = 0; i < 40; i++) {
    await p.keyboard.press('Tab')
    const probe = () => p.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      // The ring may be drawn on the element or on its wrapper (for example .search-shell:has(:focus-visible)).
      const ring = (n) => { const s = getComputedStyle(n); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none' }
      const visible = ring(el) || (!!el.parentElement && ring(el.parentElement) && getComputedStyle(el.parentElement).outlineStyle !== 'none')
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 40)
      return { tag: el.tagName.toLowerCase(), label, visible, inDialog: !!el.closest('dialog') }
    })
    let f = await probe()
    if (f && !f.visible) { await p.waitForTimeout(400); f = await probe() } // Chrome paints a date input's focus late
    if (!f) break
    if (tabs.length && tabs[0].tag === f.tag && tabs[0].label === f.label) break // wrapped
    tabs.push(f)
  }
  const noFocus = tabs.filter((t) => !t.visible)
  const row = { name, url: p.url().replace(base, ''), violations: r, overflow, motion, tabStops: tabs.length, noFocus }
  console.log(`${width} ${name.padEnd(22)} axe:${r.map((v) => `${v.id}(${v.impact},${v.nodes})`).join(' ') || 'none'}${overflow > 0 ? ` OVERFLOW:${overflow}px` : ''}${motion.length ? ` MOTION:${motion.join(',')}` : ''}${noFocus.length ? ` NO-FOCUS:${noFocus.map((t) => t.tag + ':' + t.label).join('|')}` : ''}`)
  return row
}

const json = (p, path, method = 'GET', body) => p.evaluate(async ([path, method, body]) => {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  return r.json().catch(() => null)
}, [path, method, body])
let lastSignIn = 0
async function signIn(p, email, password) {
  await wait(Math.max(0, lastSignIn + 4000 - Date.now())); lastSignIn = Date.now() // 3 sign-ins per 10 s per IP
  await p.goto(base + '/app/signin'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', password)
  await p.locator('form button.btn-primary').click()
  // A busy run can meet the 100-requests-a-minute limit; wait it out once.
  await p.waitForURL((u) => !u.pathname.endsWith('/signin'), { timeout: 10000 }).catch(async () => { await wait(60000); await p.locator('form button.btn-primary').click(); await p.waitForURL((u) => !u.pathname.endsWith('/signin')) })
}

for (const width of widths.length ? widths.map(Number) : [390, 1280]) {
  const rows = []
  const ctx = await b.newContext({ viewport: { width, height: width < 600 ? 844 : 860 }, reducedMotion: 'reduce', permissions: ['camera', 'microphone'] })
  const p = await ctx.newPage()
  const go = async (path, name) => { await p.goto((path === '/' ? home : base) + path); rows.push(await audit(p, name, width)) }

  // Signed out.
  await go('/', 'homepage')
  await go('/app/signin', 'signin')
  await p.locator('form button.btn-primary').click(); await p.waitForTimeout(400)
  rows.push(await audit(p, 'signin-errors', width))
  rows.at(-1).errorsAnnounced = await p.evaluate(() => [...document.querySelectorAll('input')].map((i) => ({ name: i.name, invalid: i.getAttribute('aria-invalid'), describedBy: i.getAttribute('aria-describedby') })))
  await go('/app/signup', 'signup')
  await go('/app/forgot-password', 'forgot-password')
  await go('/app/reset-password?token=x', 'reset-password')
  await go('/app/nope', '404')
  await go('/app/book?service=general', 'J1-service')
  await p.getByRole('radio', { name: 'Adult urgent care', exact: true }).check(); await p.getByRole('button', { name: 'Continue' }).click(); await p.waitForURL(/book\/who/)
  await p.getByRole('button', { name: 'Continue' }).click(); await p.waitForTimeout(300)
  rows.push(await audit(p, 'J2-who-errors', width))
  await p.getByRole('radio', { name: /^Me / }).check(); await p.getByLabel('Yes, I’ll be in mainland Portugal').check()
  rows.push(await audit(p, 'J2-who', width))
  await p.getByRole('button', { name: 'Continue' }).click(); await p.waitForURL(/book\/time/)
  await p.locator('[role=radiogroup] [role=radio]').first().waitFor()
  rows.push(await audit(p, 'J3-time', width))
  // Doctor profile dialog by keyboard: focus moves in, stays in, and returns to the opener on Escape.
  const opener = p.getByRole('button', { name: /View profile/ }).first()
  if (await opener.count()) {
    await opener.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400)
    const inside = []
    for (let i = 0; i < 6; i++) { inside.push(await p.evaluate(() => { const el = document.activeElement; return el?.closest('dialog[open]') ? true : (el?.tagName ?? 'none') + ':' + (el?.textContent ?? '').trim().slice(0, 30) })); await p.keyboard.press('Tab') }
    rows.push(await audit(p, 'J3-profile-dialog', width))
    await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    const back = await p.evaluate(() => document.activeElement?.textContent?.trim())
    rows.at(-1).dialog = { focusStaysInside: inside.every((x) => x === true), trace: inside, focusReturnedTo: back }
    console.log(`${width} dialog: focus stays inside ${inside.map(String).join(',')}, returns to "${back}"`)
  }
  // A different time per width: one person can't have two visits at once (409 TIME_CLASH). Not the first two: a
  // demo reset books the patient a visit ~15 minutes from now, which the earliest free times can overlap (as in walk-edges).
  await p.locator('[role=radiogroup] [role=radio]').nth(width < 600 ? 2 : 4).click()
  await p.getByRole('button', { name: /^Continue with/ }).click(); await p.waitForURL(/book\/account/)
  rows.push(await audit(p, 'J4-account', width))

  // Patient.
  await signIn(p, 'patient@example.com', 'demo-password')
  await p.goto(base + '/app/book/account'); await p.waitForURL(/book\/(consent|family)/).catch(() => {})
  await p.getByRole('checkbox').waitFor()
  rows.push(await audit(p, 'J5-consent', width))
  await p.getByRole('checkbox').check(); await p.getByRole('button', { name: 'Agree and continue' }).click(); await p.waitForURL(/book\/pay/)
  rows.push(await audit(p, 'J6-pay', width))
  await p.getByRole('button', { name: /^Pay / }).click(); await p.waitForURL(/visits\//)
  rows.push(await audit(p, 'J7-booked', width))
  const up = (await json(p, '/api/appointments?scope=upcoming')).appointments
  const past = (await json(p, '/api/appointments?scope=past')).appointments
  const today = up.find((a) => a.patient?.kind === 'self' && Date.parse(a.startsAt) - Date.now() < 3600e3) ?? up[0]
  const child = up.find((a) => a.patient?.kind === 'family')
  for (const [path, name] of [
    ['/app/account', 'account'], ['/app/account/family', 'account-family'], ['/app/account/profile', 'account-profile'], ['/app/account/security', 'account-security'],
    [`/app/visits/${today.id}`, 'J7-prepare'], [`/app/visits/${today.id}/join`, 'J8-prejoin'], [`/app/visits/${today.id}/waiting`, 'J9-waiting'],
    [`/app/visits/${today.id}/call`, 'J10-call'], [`/app/visits/${child.id}/reschedule`, 'reschedule'],
    [`/app/visits/${past.find((a) => a.outcome === 'completed')?.id}/done`, 'J11-done'], ['/app/dev/outbox', 'outbox'],
    [`/app/visits/${child.id}`, 'J7-upcoming'], [`/app/visits/${past.find((a) => a.status === 'cancelled')?.id}`, 'J7-cancelled'],
    [`/app/visits/${child.id}/receipt`, 'receipt'], ['/app/account/payments', 'account-payments'],
  ]) await go(path, name)
  // Reminders: save a change, audit the saved state, then put the default back.
  // A busy run can meet the 100-requests-a-minute limit on the session check, which sends the page to sign-in;
  // wait it out once and open the visit again (the session cookie is still good).
  await p.goto(`${base}/app/visits/${child.id}`)
  await p.getByLabel(/^SMS reminder/).waitFor({ timeout: 10000 }).catch(async () => { await wait(60000); await p.goto(`${base}/app/visits/${child.id}`) })
  await p.getByLabel(/^SMS reminder/).check(); await p.getByRole('button', { name: 'Save reminders' }).click()
  await p.getByText('Reminders saved.').waitFor()
  rows.push(await audit(p, 'J7-reminders-saved', width))
  await p.getByLabel(/^SMS reminder/).uncheck(); await p.getByRole('button', { name: 'Save reminders' }).click(); await p.getByText('Reminders saved.').waitFor()
  // The receipt as printed.
  await p.emulateMedia({ media: 'print' }); await p.goto(`${base}/app/visits/${child.id}/receipt`)
  rows.push(await audit(p, 'receipt-print', width))
  await p.emulateMedia({ media: 'screen' })
  await p.goto(base + '/app/account/profile'); await p.getByRole('button', { name: 'Sign out' }).click(); await p.waitForURL(/signin/)

  // Doctor.
  await signIn(p, 'doctor@carevia.test', 'doctor-demo-password')
  await go('/app/doctor', 'J13-agenda')
  await p.locator('a.btn', { hasText: /Start visit|Open visit/ }).first().click(); await p.waitForURL(/doctor\/visits/)
  rows.push(await audit(p, 'J13-visit', width))
  const outcome = p.getByRole('button', { name: 'Needs in-person care' })
  if (await outcome.count()) {
    await outcome.click(); await p.waitForTimeout(300)
    rows.push(await audit(p, 'J13-confirm-dialog', width))
    await p.keyboard.press('Escape')
  }
  await json(p, '/api/auth/sign-out', 'POST', {})

  // Admin desk.
  if (process.env.ADMIN !== '0') {
    await go('/admin/', 'admin-login')
    await wait(Math.max(0, lastSignIn + 4000 - Date.now())); lastSignIn = Date.now()
    await p.fill('input[name=email]', 'admin@carevia.test'); await p.fill('input[name=password]', 'admin-demo-password')
    await p.getByRole('button', { name: /^Sign in/ }).click(); await p.waitForTimeout(2000)
    rows.push(await audit(p, 'admin-appointments', width))
    await p.getByRole('button', { name: /video|daily/i }).first().click().catch(() => {}); await p.waitForTimeout(500)
    rows.push(await audit(p, 'admin-daily', width))
    await p.getByRole('button', { name: 'Sign out' }).click().catch(() => {})
  }

  // Reflow: 1280 at 200% zoom is 640 CSS px; WCAG 1.4.10 is 320 CSS px.
  for (const zw of width === 1280 ? [640, 320] : []) {
    await p.setViewportSize({ width: zw, height: 800 })
    for (const path of ['/', '/app/book?service=general', '/app/signin', '/app/signup']) {
      await p.goto((path === '/' ? home : base) + path); await p.waitForLoadState('networkidle').catch(() => {})
      const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      console.log(`${width} reflow ${zw}px ${path}: ${o > 0 ? `OVERFLOW ${o}px` : 'ok'}`)
      rows.push({ name: `reflow-${zw}`, url: path, overflow: o })
    }
  }
  await writeFile(`${out}/a11y-${width}.json`, JSON.stringify(rows, null, 2))
  await ctx.close()
}
await b.close()

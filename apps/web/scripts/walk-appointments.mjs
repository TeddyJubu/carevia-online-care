// Appointments list and visit documents: node scripts/walk-appointments.mjs <outDir> [width...]   (default 390 1280)
// Against a demo API (BASE_URL as in the other walks). Checks the list's two sections, a row opening its detail,
// the receipt PDF download (content type and %PDF header), and the Prescription panel: present and opening on a
// completed visit, absent on an upcoming one. Screenshots per width, the PDF, and on macOS its first page as PNG.
// Prints "FAIL ..." for every broken expectation and exits 1 if there was one.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { launch } from './browser.mjs'
const [out, ...ws] = process.argv.slice(2)
const widths = (ws.length ? ws : ['390', '1280']).map(Number)
const base = (process.env.BASE_URL ?? process.env.BASE ?? 'http://localhost:5180').replace(/\/(app\/?)?$/, '')
const b = await launch()
let failed = 0
const check = (ok, what, got = '') => { console.log(ok ? 'ok  ' : 'FAIL', what, got ? `(${got})` : ''); if (!ok) failed++ }

for (const [i, width] of widths.entries()) {
  const ctx = await b.newContext({ viewport: { width, height: width < 600 ? 844 : 860 }, reducedMotion: 'reduce', acceptDownloads: true })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
  const shot = async (name) => { await p.waitForTimeout(600); await p.screenshot({ path: `${out}/appt-${name}-${width}.png`, fullPage: true }) }
  const api = (path, method = 'GET', body) => p.evaluate(async ([path, method, body]) => {
    const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    return r.json()
  }, [path, method, body])
  await p.goto(base + '/app/signin')
  if (i === 0) { // A fresh demo: today's visit about 15 minutes away (scheduled), the child's in 3 days, three past visits.
    await api('/api/auth/sign-in/email', 'POST', { email: 'admin@carevia.test', password: process.env.DEMO_ADMIN_PASSWORD })
    console.log('reset', JSON.stringify(await api('/api/demo/reset', 'POST', {})))
    await api('/api/auth/sign-out', 'POST', {})
    await p.waitForTimeout(4000) // sign-in is limited to 3 per 10 s per IP
  }
  await p.fill('input[name=email]', 'patient@example.com'); await p.fill('input[name=password]', 'demo-password')
  await p.locator('form button.btn-primary').click(); await p.waitForURL((u) => !u.pathname.endsWith('/signin'))

  // The list
  await p.getByRole('link', { name: 'Appointments', exact: true }).first().click()
  await p.waitForURL(/\/app\/appointments$/)
  const up = p.getByRole('region', { name: 'Upcoming' }), past = p.getByRole('region', { name: 'Past' })
  await up.locator('li').first().waitFor()
  await past.locator('li').first().waitFor()
  const nUp = await up.locator('li').count(), nPast = await past.locator('li').count()
  check(nUp >= 2 && nPast >= 3, 'list renders Upcoming and Past', `${nUp} upcoming, ${nPast} past`)
  check(await up.getByText('Leo Patient').count() > 0, 'a family member’s visit is listed with their name')
  check(await p.getByRole('link', { name: 'Book new care' }).first().getAttribute('href') === '/app/book', 'Book new care opens /app/book')
  await shot('list')

  // An upcoming row opens its detail: receipt yes, Prescription no
  await up.locator('li a').first().click()
  await p.waitForURL(/\/app\/visits\/[^/]+$/)
  const docs = p.getByRole('region', { name: 'Documents' })
  await docs.waitFor()
  check(await docs.getByRole('button', { name: 'Prescription' }).count() === 0, 'no Prescription button on an upcoming visit')
  check(await docs.getByText('appears here after it').count() === 1, 'upcoming visit says documents appear after the visit')
  const receipt = docs.getByRole('link', { name: /Download receipt/ })
  const href = await receipt.getAttribute('href')
  const res = await ctx.request.get(base + href)
  const bytes = await res.body()
  check(res.status() === 200 && res.headers()['content-type'] === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-',
    'receipt is a PDF', `${res.status()} ${res.headers()['content-type']} ${bytes.subarray(0, 5)}`)
  const [download] = await Promise.all([p.waitForEvent('download'), receipt.click()])
  const pdfPath = `${out}/appt-receipt-${width}.pdf`
  await download.saveAs(pdfPath)
  check((await readFile(pdfPath)).subarray(0, 5).toString() === '%PDF-' && /^carevia-receipt-CV-\d{8}-\w{6}\.pdf$/.test(download.suggestedFilename()),
    'Download receipt downloads the PDF', download.suggestedFilename())
  await shot('upcoming-detail')

  // A completed past visit: the Prescription panel opens
  await p.goto(base + '/app/appointments')
  await past.locator('li', { hasText: 'Completed' }).first().getByRole('link').click()
  await p.waitForURL(/\/done$/)
  const btn = p.getByRole('region', { name: 'Documents' }).getByRole('button', { name: 'Prescription' })
  await btn.waitFor()
  const panel = p.getByRole('region', { name: 'About prescriptions' })
  check(!(await panel.isVisible()) && await btn.getAttribute('aria-expanded') === 'false', 'Prescription panel starts closed')
  await btn.click()
  await panel.waitFor({ state: 'visible' })
  check(await btn.getAttribute('aria-expanded') === 'true' && /national e-prescription system/.test(await panel.innerText()), 'Prescription panel opens on a completed visit')
  await shot('completed-detail')

  if (i === 0 && process.platform === 'darwin') {
    try {
      execFileSync('sips', ['-s', 'format', 'png', '-Z', '1400', pdfPath, '--out', `${out}/appt-receipt-page1.png`], { stdio: 'ignore' })
      console.log('PDF page 1:', `${out}/appt-receipt-page1.png`)
    } catch (e) { console.log('PDF to PNG skipped:', e.message.split('\n')[0]) }
  }
  await ctx.close()
}
await b.close()
await writeFile(`${out}/appt-walk.txt`, `failed ${failed}\n`)
console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)

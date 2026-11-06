import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
const root = process.argv[2]
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' }
const srv = createServer(async (q, r) => { const p = join(root, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html')); let body; try { body = await readFile(p) } catch { r.writeHead(404); return r.end() } r.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }); r.end(body) }).listen(4791)
const b = await chromium.launch()
for (const w of [1280, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 } })
  await p.goto('http://127.0.0.1:4791/'); await p.evaluate(() => document.querySelector('#care').scrollIntoView()); await p.waitForTimeout(1200)
  console.log(w, JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.topbar, .topbar > *, .topbar .nav-emblem')].map((e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return `${e.className.split(' ').slice(0, 2).join('.')}: x${Math.round(r.x)} y${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} pad ${s.padding} r ${s.borderRadius} fs ${s.fontSize}` }))))
}
await b.close(); srv.close()

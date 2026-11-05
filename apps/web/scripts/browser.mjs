// Starts Chromium for the walk scripts: locally by default, or in Browserbase's cloud with BROWSERBASE=1.
// Cloud runs need BROWSERBASE_API_KEY (the key alone picks the project) and print a replay link to share.
// Local-only launch options (the fake camera flags) don't apply to cloud browsers.
import { chromium } from 'playwright'

export async function launch(options) {
  if (process.env.BROWSERBASE !== '1') return chromium.launch(options)
  const key = process.env.BROWSERBASE_API_KEY
  if (!key) throw new Error('BROWSERBASE=1 needs BROWSERBASE_API_KEY')
  const res = await fetch('https://api.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: { 'X-BB-API-Key': key, 'Content-Type': 'application/json' },
    // Frankfurt: the Browserbase region closest to patients in Portugal.
    body: JSON.stringify({ region: 'eu-central-1' }),
  })
  if (!res.ok) throw new Error(`Browserbase session: ${res.status} ${await res.text()}`)
  const session = await res.json()
  console.log(`Browserbase replay: https://www.browserbase.com/sessions/${session.id}`)
  return chromium.connectOverCDP(session.connectUrl)
}

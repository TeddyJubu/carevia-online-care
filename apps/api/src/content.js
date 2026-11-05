import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REAL = path.resolve(apiRoot, '../../content/patient-journey/consent.md')
// Until the content thread lands consent.md, a clearly marked placeholder with the same front matter is used.
const PLACEHOLDER = path.join(apiRoot, 'content/consent.placeholder.md')

/** Splits "---\nkey: value\n---\nbody" into { data, body }. Only flat `key: value` lines; `#` starts a comment. */
export function parseFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return { data: {}, body: text }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*?)\s*(?:#.*)?$/.exec(line)
    if (pair) data[pair[1]] = pair[2].replace(/^["']|["']$/g, '')
  }
  return { data, body: match[2].trim() }
}

/** Drops the leading "> Draft for review…" note: it is for reviewers, not patients. Later quotes are kept. */
export function patientBody(body) {
  return body.replace(/^> Draft for review[^\n]*(\r?\n)*/, '').trim()
}

/** Read on every call, so an edited consent.md takes effect without a restart. */
export function currentConsent() {
  const file = fs.existsSync(REAL) ? REAL : PLACEHOLDER
  const { data, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'))
  return { version: data.version, title: data.title, body: patientBody(body), recordingOffered: false }
}

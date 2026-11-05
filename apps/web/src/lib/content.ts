// Texts owned by the content thread, in content/patient-journey/*.md, imported at build time.
// Until those files land, each id falls back to a clearly marked placeholder with the same front matter.
const files = import.meta.glob('../../../../content/patient-journey/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export type ContentId = 'consent' | 'emergency' | 'cancellation' | 'recording' | 'demo-banner'
export type ContentDoc = { id: ContentId; version: string; status: string; title: string; body: string; placeholder: boolean }

const PLACEHOLDER = '**Placeholder text** until the content thread’s draft lands. Not reviewed.'

const fallback: Record<ContentId, Omit<ContentDoc, 'id' | 'placeholder'>> = {
  consent: {
    version: '0000-00-00.placeholder',
    status: 'placeholder',
    title: 'Before your consultation',
    body: `${PLACEHOLDER}

## How your visit works
You speak with a doctor registered with the Ordem dos Médicos by secure video, in your browser. The doctor decides what is appropriate after assessing you.

## In-person care is always an option
If your doctor thinks you need to be examined in person, or if your situation is urgent, they will tell you. You can choose an in-person visit instead at any time.

## Price
You pay the price shown before you book. There are no other charges.

## Recording
Your visit is not recorded.

## Emergencies
Carevia is not an emergency service. In an emergency, call 112.`,
  },
  emergency: { version: '0000-00-00.placeholder', status: 'placeholder', title: 'Emergencies', body: 'Not an emergency service. In an emergency, call 112.' },
  cancellation: {
    version: '0000-00-00.placeholder',
    status: 'placeholder',
    title: 'Cancelling a visit',
    body: `${PLACEHOLDER}\n\nYou can cancel until the visit starts. In this demo, no money is taken, so there is nothing to refund.`,
  },
  recording: { version: '0000-00-00.placeholder', status: 'placeholder', title: 'Recording', body: 'Your visit is not recorded.' },
  'demo-banner': { version: '0000-00-00.placeholder', status: 'placeholder', title: 'Demo', body: 'Demo: fictional data. No real doctors, patients or payments.' },
}

function parse(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!m) return { meta: {}, body: raw.trim() }
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w[\w-]*):\s*(.*?)\s*(#.*)?$/.exec(line)
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return { meta, body: m[2].trim() }
}

const loaded = new Map<string, ContentDoc>()
for (const raw of Object.values(files)) {
  const { meta, body } = parse(raw)
  if (meta.id) loaded.set(meta.id, { id: meta.id as ContentId, version: meta.version ?? '', status: meta.status ?? '', title: meta.title ?? '', body, placeholder: false })
}

export function content(id: ContentId): ContentDoc {
  return loaded.get(id) ?? { id, ...fallback[id], placeholder: true }
}

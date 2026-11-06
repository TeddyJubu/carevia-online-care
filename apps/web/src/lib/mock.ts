// In-memory implementation of docs/patient-journey/API-CONTRACT.md for VITE_API_MOCK=1.
// It mirrors the contract's rules (holds, consent, demo payment, join window, roles) so every screen can be
// built and tested without the API. Fictional data only; no clinical fields exist anywhere.
// ponytail: state lives in sessionStorage so a reload keeps it; one tab = one "browser" for hold cookies.
import { content } from './content'
import { addDays, age, lisbonDay, lisbonToUtc } from './time'
import type { Appointment, Doctor, FamilyMember, For, GroupSlug, Outcome, Role, ServiceGroup, Status } from './types'

type Res = { status: number; data: any }

const GROUPS: { slug: GroupSlug; name: string; blurb: string; icon: string; services: string[] }[] = [
  { slug: 'general', name: 'General & urgent care', blurb: 'General medicine, child care and common conditions', icon: 'stethoscope', services: ['Adult urgent care', 'Paediatric urgent care', 'Adult check-up', 'Child consultation', 'Respiratory infections', 'Urinary infections', 'Skin consultation', 'Hair loss', 'Pain', 'Allergies', 'Hypertension', 'Contraception', 'Men’s health', 'Sexology'] },
  { slug: 'mental', name: 'Mental health', blurb: 'Psychology, psychiatry and ongoing support', icon: 'brain', services: ['Adult psychology', 'Child psychology', 'Psychiatry', 'Child psychiatry', 'Adult ADHD', 'Child ADHD', 'Autism', 'Couples and family therapy', 'Eating disorders', 'Screen and gaming dependency', 'Substance and behavioural dependencies', 'Smoking cessation'] },
  { slug: 'nutrition', name: 'Weight management', blurb: 'Nutrition and weight-loss consultations', icon: 'scale', services: ['Nutrition', 'Weight-loss consultation'] },
  { slug: 'specialist', name: 'Specialist care', blurb: 'Find the right specialist for your needs', icon: 'microscope', services: ['Gynaecology', 'Neurology', 'Endocrinology', 'Rheumatology', 'Paediatrics', 'Migraine', 'Menopause', 'Breastfeeding', 'Travel medicine'] },
  { slug: 'certificates', name: 'Certificates & assessments', blurb: 'Fitness and health assessments with a doctor', icon: 'file-check', services: ['Sick leave assessment', 'Illness assessment', 'Nursery and school fitness assessment', 'Occupational fitness assessment', 'Driving fitness assessment', 'Driving fitness with psychotechnical assessment', 'In-person psychotechnical assessment', 'Hunting or firearms fitness assessment', 'Diving fitness assessment', 'Boating licence fitness assessment'] },
  { slug: 'treatments', name: 'Treatments', blurb: 'Clinical advice and treatment review', icon: 'pill', services: ['Skin treatment', 'Hair-loss treatment', 'Pain management', 'Allergies treatment', 'Hypertension treatment', 'Smoking cessation'] },
  { slug: 'renewals', name: 'Test requests & renewals', blurb: 'Doctor consultations for test requests and treatment renewals', icon: 'test-tube-diagonal', services: ['Tests and laboratory investigations', 'Treatment renewal review'] },
]
const FIRST = ['Emma', 'Lucas', 'Sofia', 'Noah', 'Amelia', 'Hugo', 'Clara', 'Leo', 'Ines', 'Oscar', 'Maya', 'Felix', 'Elena', 'Adam', 'Nora', 'Louis', 'Alice', 'Milan', 'Sara', 'Theo']
const LAST = ['Laurent', 'Meyer', 'Martins', 'Rossi', 'Dubois', 'Silva', 'Weber', 'Costa', 'Moreau', 'Fischer', 'Romano', 'Pereira', 'Bernard', 'Schmidt', 'Almeida', 'Fontana', 'Petit', 'Andersson', 'Novak', 'Lindberg']
const LANGS = ['English · French', 'English · German', 'Portuguese · French', 'English · Spanish', 'English · Italian', 'German · Portuguese', 'Spanish · French']
const FEES = [45, 65, 85, 110]

type Svc = { id: number; name: string; groupIndex: number }
type Doc = Doctor & { groupIndex: number; serviceId: number; availabilityIndex: number }
const services: Svc[] = []
const doctors: Doc[] = []
GROUPS.forEach((g, gi) => g.services.forEach((name, si) => {
  const svc = { id: services.length + 1, name, groupIndex: gi }
  services.push(svc)
  for (let v = 0; v < 4; v++) {
    const id = doctors.length
    const first = FIRST[id % 20], last = LAST[Math.floor(id / 20) % 20]
    const child = /Child|Paediatric|Nursery/.test(name)
    const specialty = gi === 1 ? (/Psychiatry|ADHD|Autism/.test(name) ? 'Psychiatry' : 'Psychology') : child ? 'Paediatrics' : v % 2 ? 'Family medicine' : 'General practitioner'
    doctors.push({
      id, name: `Dr ${first} ${last}`, initials: `${first[0]}${last[0]}`, specialty, languages: LANGS[(si + gi + v) % LANGS.length],
      fee: FEES[v], cedula: `DEMO-CEDULA-${id}`, experience: `${5 + (id % 19)} years`, education: `Illustrative professional qualification and specialist training in ${specialty}`,
      approach: 'A clear, collaborative consultation with time for your questions.', group: gi, groupName: g.name, service: name,
      groupIndex: gi, serviceId: svc.id, availabilityIndex: v % 3,
    })
  }
}))

const TIMES = ['08:00', '08:40', '09:20', '10:00', '10:40', '11:20', '12:00', '14:00', '14:40', '15:20', '16:00', '16:40', '17:20', '18:00', '18:40', '19:20', '20:00', '20:40', '21:20', '22:00', '22:40']
const SLOT_MIN = 20

function slotsFor(doc: Doc, from: string, days: number) {
  const out: { id: string; startsAt: string; endsAt: string }[] = []
  const today = lisbonDay()
  const now = Date.now()
  const taken = new Set(db().appts.filter((a) => a.doctorId === doc.id && blocks(a)).map((a) => a.startsAt))
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i)
    const offset = Math.round((Date.parse(day) - Date.parse(today)) / 86400000)
    if (offset < doc.availabilityIndex || offset > 21) continue
    const wd = new Date(`${day}T12:00:00Z`).getUTCDay()
    if (wd === 0) continue // Sundays off; Saturdays on, so weekend demos still have times.
    TIMES.forEach((t, ti) => {
      if ((ti + doc.id + offset) % 3 === 0) return
      const s = lisbonToUtc(day, t)
      if (s.getTime() <= now) return
      const startsAt = s.toISOString()
      if (taken.has(startsAt)) return
      out.push({ id: `${doc.id}_${startsAt}`, startsAt, endsAt: new Date(s.getTime() + SLOT_MIN * 60000).toISOString() })
    })
  }
  return out
}

// ---------- state ----------
type U = { id: string; email: string; password: string; firstName: string; lastName: string; phone: string; dateOfBirth: string; role: Role; emailVerified: boolean; twoFactorEnabled: boolean; doctorId?: number }
type Fam = FamilyMember & { userId: string }
type Rec = {
  id: string; status: Status; outcome: Outcome | null; holdExpiresAt: string | null; holdOwner: string | null
  startsAt: string; endsAt: string; fee: number; serviceId: number; doctorId: number; for: For
  userId: string | null; familyMemberId: string | null; patientSet: boolean
  consent: { version: string; acceptedAt: string } | null; paidAt: string | null
  remind: { email: boolean; sms: boolean }
  preJoin: { confirmedAt: string | null; companion: boolean } | null
  callState: 'not_started' | 'in_progress' | 'ended'; reconnects: number
}
type Mail = { id: string; to: string; subject: string; text: string; links: string[]; sentAt: string }
type DB = { users: U[]; family: Fam[]; appts: Rec[]; outbox: Mail[]; sessionUser: string | null; pending2fa: string | null; enabling2fa: boolean; resetTokens: Record<string, string> }

const KEY = 'carevia-mock-v2' // v2: payment amount and date, reminder choices
const BROWSER = 'this-browser'
let state: DB | null = null
const rid = () => Math.random().toString(36).slice(2, 12)

function seed(): DB {
  const now = Date.now()
  const at = (ms: number) => new Date(Math.ceil((now + ms) / 60000) * 60000).toISOString()
  const plus = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60000).toISOString()
  const base = { outcome: null, holdExpiresAt: null, holdOwner: null, fee: 45, doctorId: 0, userId: 'u-patient', patientSet: true, paidAt: new Date(now - 2 * 86400000).toISOString(), remind: { email: true, sms: false }, callState: 'not_started' as const, reconnects: 0, preJoin: null }
  const consent = { version: content('consent').version, acceptedAt: at(-86400000) }
  // ponytail: 8 minutes (the contract's seed uses 15) so the mock's join window is already open for demos and screenshots.
  const soon = at(8 * 60000)
  const in3 = lisbonToUtc(addDays(lisbonDay(), 3), '10:00').toISOString()
  const past = (days: number) => lisbonToUtc(addDays(lisbonDay(), -days), '11:00').toISOString()
  const appt = (id: string, startsAt: string, more: Partial<Rec>): Rec => ({ ...base, id, startsAt, endsAt: plus(startsAt, SLOT_MIN), status: 'confirmed', serviceId: 1, for: 'self', familyMemberId: null, consent, ...more })
  return {
    users: [
      { id: 'u-patient', email: 'patient@example.com', password: 'demo-password', firstName: 'Demo', lastName: 'Patient', phone: '+351900000000', dateOfBirth: '1990-01-01', role: 'patient', emailVerified: true, twoFactorEnabled: false },
      { id: 'u-doctor', email: 'doctor@carevia.test', password: 'doctor-demo-password', firstName: 'Emma', lastName: 'Laurent', phone: '+351900000001', dateOfBirth: '1980-05-05', role: 'clinician', emailVerified: true, twoFactorEnabled: false, doctorId: 0 },
      { id: 'u-admin', email: 'admin@carevia.test', password: 'admin-demo-password', firstName: 'Demo', lastName: 'Admin', phone: '+351900000002', dateOfBirth: '1985-01-01', role: 'admin', emailVerified: true, twoFactorEnabled: false },
    ],
    family: [{ id: 'f-leo', userId: 'u-patient', firstName: 'Leo', lastName: 'Patient', dateOfBirth: '2018-03-14', relationship: 'child' }],
    appts: [
      appt('appt-today', soon, {}),
      appt('appt-child', in3, { for: 'child', familyMemberId: 'f-leo', serviceId: 4 }),
      appt('appt-past-1', past(7), { status: 'completed', outcome: 'completed', callState: 'ended' }),
      appt('appt-past-2', past(30), { status: 'completed', outcome: 'needs_in_person', callState: 'ended' }),
      appt('appt-past-3', past(14), { status: 'cancelled' }),
    ],
    outbox: [], sessionUser: null, pending2fa: null, enabling2fa: false, resetTokens: {},
  }
}

function db(): DB {
  if (!state) {
    try { state = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') } catch { state = null }
    state ??= seed()
  }
  return state
}
const save = () => sessionStorage.setItem(KEY, JSON.stringify(state))
export function resetMock() { state = seed(); save() }

// ---------- helpers ----------
const ok = (data: any = { ok: true }, status = 200): Res => ({ status, data })
const err = (status: number, error: string, message: string): Res => ({ status, data: { error, code: error, message } })
const me = () => db().users.find((u) => u.id === db().sessionUser) ?? null
const publicUser = (u: U) => ({ id: u.id, email: u.email, emailVerified: u.emailVerified, firstName: u.firstName, lastName: u.lastName, phone: u.phone, dateOfBirth: u.dateOfBirth, role: u.role, twoFactorEnabled: u.twoFactorEnabled })
const holdLive = (a: Rec) => a.status === 'held' && !!a.holdExpiresAt && Date.parse(a.holdExpiresAt) > Date.now()
const blocks = (a: Rec) => a.status === 'confirmed' || a.status === 'completed' || holdLive(a)
const windowOf = (a: Rec) => ({ opens: Date.parse(a.startsAt) - 10 * 60000, closes: Date.parse(a.endsAt) + 60 * 60000 })
const mail = (to: string, subject: string, text: string, links: string[] = []) =>
  db().outbox.unshift({ id: rid(), to, subject, text, links, sentAt: new Date().toISOString() })

function view(a: Rec): Appointment {
  const svc = services.find((s) => s.id === a.serviceId)!
  const g = GROUPS[svc.groupIndex]
  const d = doctors[a.doctorId]
  const fam = a.familyMemberId ? db().family.find((f) => f.id === a.familyMemberId) : null
  const owner = db().users.find((u) => u.id === a.userId)
  const w = windowOf(a)
  return {
    id: a.id, status: a.status, outcome: a.outcome, holdExpiresAt: a.status === 'held' ? a.holdExpiresAt : null,
    startsAt: a.startsAt, endsAt: a.endsAt, channel: 'video', fee: a.fee, for: a.for,
    service: { id: svc.id, name: svc.name, groupSlug: g.slug, groupName: g.name },
    doctor: { id: d.id, name: d.name, initials: d.initials, specialty: d.specialty, languages: d.languages, cedula: d.cedula },
    patient: !a.patientSet ? null : fam ? { kind: 'family', displayName: `${fam.firstName} ${fam.lastName}` } : owner ? { kind: 'self', displayName: `${owner.firstName} ${owner.lastName}` } : null,
    consent: a.consent, payment: a.paidAt ? { status: 'paid', method: 'demo', amount: a.fee, paidAt: a.paidAt } : null,
    reminders: { ...a.remind, sentAt: null }, preJoin: a.preJoin,
    call: { joinOpensAt: new Date(w.opens).toISOString(), joinClosesAt: new Date(w.closes).toISOString(), state: a.callState, reconnects: a.reconnects },
    imed: { status: 'not_connected' },
  }
}

function expireHolds() {
  for (const a of db().appts) if (a.status === 'held' && !holdLive(a)) a.status = 'expired'
}

function needRole(...roles: Role[]): Res | U {
  const u = me()
  if (!u) return err(401, 'AUTH_REQUIRED', 'Please sign in to continue.')
  if (!roles.includes(u.role)) return err(403, 'FORBIDDEN', 'This account can’t do that.')
  return u
}
const isRes = (x: any): x is Res => x && typeof x.status === 'number' && 'data' in x

function ownAppt(u: U, id: string): Rec | Res {
  const a = db().appts.find((x) => x.id === id)
  if (!a) return err(404, 'NOT_FOUND', 'We couldn’t find that visit.')
  if (u.role === 'patient' && a.userId !== u.id) return err(404, 'NOT_FOUND', 'We couldn’t find that visit.')
  if (u.role === 'clinician' && a.doctorId !== u.doctorId) return err(404, 'NOT_FOUND', 'We couldn’t find that visit.')
  return a
}

const BREACHED = new Set(['password', 'password1', 'password123', '12345678', '123456789', 'qwerty123', 'iloveyou'])

// ---------- routes ----------
type Handler = (m: RegExpExecArray, body: any, q: URLSearchParams) => Res
const routes: [string, RegExp, Handler][] = []
const on = (method: string, path: string, h: Handler) => routes.push([method, new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`), h])

on('GET', '/api/auth/get-session', () => {
  const u = me()
  return ok(u ? { session: { id: 's-' + u.id, expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: publicUser(u) } : null)
})
on('POST', '/api/auth/sign-up/email', (_, b) => {
  if (!b.email || !b.password || !b.firstName || !b.lastName || !b.phone || !b.dateOfBirth) return err(400, 'VALIDATION', 'Please fill in every field.')
  if (age(b.dateOfBirth) < 18) return err(400, 'UNDERAGE', 'You need to be 18 or over to create an account. A parent or guardian can book for a child.')
  if (String(b.password).length < 8) return err(400, 'PASSWORD_TOO_SHORT', 'Use at least 8 characters.')
  if (BREACHED.has(String(b.password).toLowerCase())) return err(400, 'PASSWORD_COMPROMISED', 'Password compromised.')
  if (db().users.some((u) => u.email.toLowerCase() === String(b.email).toLowerCase())) return err(422, 'USER_ALREADY_EXISTS', 'User already exists.')
  const u: U = { id: 'u-' + rid(), email: b.email, password: b.password, firstName: b.firstName, lastName: b.lastName, phone: b.phone, dateOfBirth: b.dateOfBirth, role: 'patient', emailVerified: false, twoFactorEnabled: false }
  db().users.push(u)
  db().sessionUser = u.id
  mail(u.email, 'Confirm your email for Carevia', 'Confirm your email address to finish setting up your account.', ['/app/account?verified=1'])
  return ok({ token: 't', user: publicUser(u) })
})
on('POST', '/api/auth/sign-in/email', (_, b) => {
  const u = db().users.find((x) => x.email.toLowerCase() === String(b.email ?? '').toLowerCase() && x.password === b.password)
  if (!u) return err(401, 'INVALID_EMAIL_OR_PASSWORD', 'Invalid email or password')
  if (u.twoFactorEnabled) { db().pending2fa = u.id; return ok({ twoFactorRedirect: true }) }
  db().sessionUser = u.id
  return ok({ user: publicUser(u) })
})
// ponytail: the mock accepts any six-digit code; the real check is Better Auth's TOTP.
on('POST', '/api/auth/two-factor/verify-totp', (_, b) => {
  if (!/^\d{6}$/.test(String(b.code ?? ''))) return err(401, 'INVALID_TWO_FACTOR_CODE', 'Invalid code')
  if (db().pending2fa) { db().sessionUser = db().pending2fa; db().pending2fa = null; return ok({ user: publicUser(me()!) }) }
  const u = me()
  if (u && db().enabling2fa) { u.twoFactorEnabled = true; db().enabling2fa = false; return ok({ user: publicUser(u) }) }
  return err(401, 'INVALID_TWO_FACTOR_CODE', 'Invalid code')
})
on('POST', '/api/auth/two-factor/enable', (_, b) => {
  const u = me(); if (!u) return err(401, 'AUTH_REQUIRED', 'Please sign in.')
  if (b.password !== u.password) return err(400, 'INVALID_PASSWORD', 'Invalid password')
  db().enabling2fa = true
  return ok({ totpURI: `otpauth://totp/Carevia:${encodeURIComponent(u.email)}?secret=JBSWY3DPEHPK3PXP&issuer=Carevia`, backupCodes: Array.from({ length: 8 }, () => rid().slice(0, 5) + '-' + rid().slice(0, 5)) })
})
on('POST', '/api/auth/two-factor/disable', (_, b) => {
  const u = me(); if (!u) return err(401, 'AUTH_REQUIRED', 'Please sign in.')
  if (b.password !== u.password) return err(400, 'INVALID_PASSWORD', 'Invalid password')
  u.twoFactorEnabled = false
  return ok()
})
on('POST', '/api/auth/sign-out', () => { db().sessionUser = null; return ok() })
on('POST', '/api/auth/request-password-reset', (_, b) => {
  const u = db().users.find((x) => x.email.toLowerCase() === String(b.email ?? '').toLowerCase())
  if (u) {
    const token = rid()
    db().resetTokens[token] = u.id
    mail(u.email, 'Reset your Carevia password', 'Use this link to choose a new password. It works once.', [`/app/reset-password?token=${token}`])
  }
  return ok({ status: true }) // Same answer either way, so nobody can test which emails have accounts.
})
on('POST', '/api/auth/reset-password', (_, b) => {
  const uid = db().resetTokens[b.token]
  if (!uid) return err(400, 'INVALID_TOKEN', 'This reset link has expired or was already used. Ask for a new one.')
  if (String(b.newPassword).length < 8) return err(400, 'PASSWORD_TOO_SHORT', 'Use at least 8 characters.')
  if (BREACHED.has(String(b.newPassword).toLowerCase())) return err(400, 'PASSWORD_COMPROMISED', 'Password compromised.')
  db().users.find((u) => u.id === uid)!.password = b.newPassword
  delete db().resetTokens[b.token]
  return ok({ status: true })
})
on('POST', '/api/auth/change-password', (_, b) => {
  const u = me(); if (!u) return err(401, 'AUTH_REQUIRED', 'Please sign in.')
  if (b.currentPassword !== u.password) return err(400, 'INVALID_PASSWORD', 'Invalid password')
  if (String(b.newPassword).length < 8) return err(400, 'PASSWORD_TOO_SHORT', 'Use at least 8 characters.')
  if (BREACHED.has(String(b.newPassword).toLowerCase())) return err(400, 'PASSWORD_COMPROMISED', 'Password compromised.')
  u.password = b.newPassword
  return ok()
})

// Plate copy, as seeded by apps/api (admin-editable there).
const PLATE: Record<string, [string[], string]> = {
  general: [["Something new in the last few days", "Fever, cough, infection, rash or minor injury", "Any age, from babies to adults"], "Specialist care: choose that for a known, ongoing condition."],
  mental: [["Low mood, anxiety, stress or poor sleep", "You’d like the same clinician each time", "Talking therapy or medication advice"], "Treatments: choose that if you only need a medication review."],
  nutrition: [["A planned change, not a sudden one", "Regular check-ins over weeks", "Nutrition plans you can follow at home"], "General & urgent care: for weight change you can’t explain."],
  specialist: [["A known condition that needs an expert", "Gynaecology, neurology, endocrinology and more", "No referral needed"], "General & urgent care: for symptoms that are new."],
  certificates: [["You need a document, not a diagnosis", "Sick leave, school or nursery fitness", "Usually 10 to 15 minutes"], "Test requests & renewals: for lab orders and results."],
  treatments: [["Skin, hair loss or ongoing pain", "Reviewing a treatment you’ve started", "Prescription is often the outcome"], "Specialist care: when you still need a diagnosis."],
  renewals: [["You already know what you need", "Lab tests or a repeat prescription", "Results arrive in your account"], "Certificates & assessments: for written statements."],
}
on('GET', '/api/services', () => {
  const today = lisbonDay()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const now = new Date().toISOString()
  return ok({
  today,
  groups: GROUPS.map((g, gi): ServiceGroup => {
    const open = doctors.filter((d) => d.groupIndex === gi).flatMap((d) => slotsFor(d, today, 7)).map((x) => x.startsAt).filter((t) => t > now).sort()
    return {
    id: gi, slug: g.slug, name: g.name, blurb: g.blurb, icon: g.icon,
    fieldMarks: PLATE[g.slug]?.[0] ?? [], confusedWith: PLATE[g.slug]?.[1] ?? '',
    week: days.map((day) => open.filter((t) => lisbonDay(t) === day).length), nextAvailableAt: open[0] ?? null,
    fromFee: Math.min(...doctors.filter((d) => d.groupIndex === gi).map((d) => d.fee)),
    services: services.filter((s) => s.groupIndex === gi).map(({ id, name }) => ({ id, name })),
  }}),
  })
})
function nextAvailable(d: Doc) { return slotsFor(d, lisbonDay(), 22)[0]?.startsAt ?? null }
on('GET', '/api/doctors', (_, __, q) => {
  const gi = GROUPS.findIndex((g) => g.slug === q.get('groupSlug'))
  let list = doctors.filter((d) => (gi < 0 || d.groupIndex === gi) && (!q.get('service') || d.service === q.get('service')) && (!q.get('language') || d.languages.split(' · ').includes(q.get('language')!)))
  const out = list.map(({ groupIndex: _g, serviceId: _s, availabilityIndex: _a, ...d }) => ({ ...d, nextAvailableAt: nextAvailable(doctors[d.id]) }))
  if (q.get('sort') === 'first-available') out.sort((a, b) => (a.nextAvailableAt ?? 'z').localeCompare(b.nextAvailableAt ?? 'z'))
  return ok({ doctors: out, count: out.length })
})
on('GET', '/api/doctors/(\\d+)/slots', (m, _, q) => {
  const d = doctors[+m[1]]; if (!d) return err(404, 'NOT_FOUND', 'Doctor not found.')
  return ok({ doctorId: d.id, slots: slotsFor(d, q.get('from') || lisbonDay(), Math.min(+(q.get('days') || 7), 21)) })
})
on('GET', '/api/doctors/(\\d+)', (m) => {
  const d = doctors[+m[1]]; if (!d) return err(404, 'NOT_FOUND', 'Doctor not found.')
  const { groupIndex: _g, serviceId: _s, availabilityIndex: _a, ...rest } = d
  return ok({ doctor: rest })
})
on('GET', '/api/slots/first-available', (_, __, q) => {
  const gi = GROUPS.findIndex((g) => g.slug === q.get('groupSlug'))
  const sid = Number(q.get('serviceId') || 0)
  const lang = q.get('language')
  const pool = doctors.filter((d) => (gi < 0 || d.groupIndex === gi) && (!sid || d.serviceId === sid) && (!lang || d.languages.split(' · ').includes(lang)))
  const all = pool.flatMap((d) => slotsFor(d, lisbonDay(), 7).slice(0, 6).map((s) => ({ ...s, doctor: { id: d.id, name: d.name, initials: d.initials, specialty: d.specialty, languages: d.languages, fee: d.fee, cedula: d.cedula } })))
  all.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return ok({ slots: all.slice(0, Number(q.get('limit') || 6)) })
})

on('POST', '/api/bookings', (_, b) => {
  if (b.inMainlandPortugal !== true) return err(400, 'NOT_ELIGIBLE', 'Carevia can only see patients who are in mainland Portugal during the visit.')
  if (b.channel === 'audio') return err(400, 'AUDIO_DISABLED', 'Audio visits are not available yet.')
  const [docId, startsAt] = String(b.slotId).split('_')
  const d = doctors[+docId]
  const svc = services.find((s) => s.id === b.serviceId)
  if (!d || !startsAt || !svc) return err(400, 'VALIDATION', 'That time or service no longer exists.')
  if (!slotsFor(d, lisbonDay(startsAt), 1).some((s) => s.startsAt === startsAt)) return err(409, 'SLOT_TAKEN', 'Someone has just booked that time. Please choose another.')
  for (const a of db().appts) if (a.holdOwner === BROWSER && a.status === 'held') a.status = 'expired'
  const u = me()
  const a: Rec = {
    id: 'ck' + rid(), status: 'held', outcome: null, holdExpiresAt: new Date(Date.now() + 10 * 60000).toISOString(), holdOwner: BROWSER,
    startsAt, endsAt: new Date(Date.parse(startsAt) + SLOT_MIN * 60000).toISOString(), fee: d.fee, serviceId: svc.id, doctorId: d.id, for: b.for ?? 'self',
    userId: u?.role === 'patient' ? u.id : null, familyMemberId: null, patientSet: false, consent: null, paidAt: null, remind: { email: true, sms: false }, preJoin: null, callState: 'not_started', reconnects: 0,
  }
  db().appts.push(a)
  return ok({ appointment: view(a) }, 201)
})
on('POST', '/api/bookings/([^/]+)/claim', (m) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const a = db().appts.find((x) => x.id === m[1])
  if (!a || (a.holdOwner !== BROWSER && a.userId !== u.id)) return err(404, 'NOT_FOUND', 'We couldn’t find that booking.')
  if (a.status === 'confirmed') return err(409, 'NOT_HELD', 'This booking is already confirmed.')
  if (a.status !== 'held') return err(410, 'HOLD_EXPIRED', 'Your 10-minute hold has ended, so the time was released. Please choose a time again.')
  a.userId = u.id
  if (a.for === 'self') a.patientSet = true // as the API does
  return ok({ appointment: view(a) })
})
on('PUT', '/api/bookings/([^/]+)/patient', (m, b) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  if (b.familyMemberId) {
    const f = db().family.find((x) => x.id === b.familyMemberId && x.userId === u.id)
    if (!f) return err(404, 'NOT_FOUND', 'We couldn’t find that family member.')
    if (f.relationship !== a.for) return err(400, 'VALIDATION', a.for === 'child' ? 'Choose a child for this visit.' : 'Choose an adult for this visit.')
    a.familyMemberId = f.id
  } else {
    if (a.for !== 'self') return err(400, 'VALIDATION', 'Choose who this visit is for.')
    a.familyMemberId = null
  }
  a.patientSet = true
  return ok({ appointment: view(a) })
})
on('GET', '/api/consent/current', () => {
  const c = content('consent')
  return ok({ version: c.version, title: c.title, body: c.body, recordingOffered: false })
})
on('POST', '/api/bookings/([^/]+)/consent', (m, b) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  if (b.version !== content('consent').version) return err(409, 'CONSENT_OUTDATED', 'The consent text has been updated. Please read it again.')
  a.consent = { version: b.version, acceptedAt: new Date().toISOString() }
  return ok({ appointment: view(a) })
})
on('POST', '/api/bookings/([^/]+)/pay', (m) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  if (a.status !== 'held') return err(410, 'HOLD_EXPIRED', 'Your 10-minute hold has ended, so the time was released. Please choose a time again.')
  if (!a.patientSet) return err(400, 'PATIENT_REQUIRED', 'Choose who this visit is for first.')
  if (!a.consent) return err(400, 'CONSENT_REQUIRED', 'Please read and accept the consultation terms first.')
  a.status = 'confirmed'; a.paidAt = new Date().toISOString(); a.holdExpiresAt = null; a.holdOwner = null
  mail(u.email, 'Your Carevia visit is booked', 'Your video visit is confirmed. You can join from your account 10 minutes before it starts.', [`/app/visits/${a.id}`])
  return ok({ appointment: view(a) })
})
on('DELETE', '/api/bookings/([^/]+)', (m) => {
  const a = db().appts.find((x) => x.id === m[1])
  if (a && a.status === 'held' && (a.holdOwner === BROWSER || a.userId === me()?.id)) a.status = 'expired'
  return ok()
})

on('GET', '/api/appointments', (_, __, q) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const now = Date.now()
  const mine = db().appts.filter((a) => a.userId === u.id && a.status !== 'held' && a.status !== 'expired')
  const upcoming = (a: Rec) => a.status === 'confirmed' && windowOf(a).closes > now
  const list = q.get('scope') === 'past'
    ? mine.filter((a) => !upcoming(a)).sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    : mine.filter(upcoming).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return ok({ appointments: list.map(view) })
})
on('GET', '/api/appointments/([^/]+)', (m) => {
  const u = needRole('patient', 'clinician', 'admin'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  return ok({ appointment: view(a) })
})
on('POST', '/api/appointments/([^/]+)/cancel', (m) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  if (a.status !== 'confirmed' || Date.parse(a.startsAt) <= Date.now()) return err(409, 'CANNOT_CANCEL', 'This visit can no longer be cancelled.')
  a.status = 'cancelled'
  return ok({ appointment: view(a) })
})
on('POST', '/api/appointments/([^/]+)/reschedule', (m, b) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  const now = Date.now()
  const ok2 = a.status === 'confirmed' && (now < Date.parse(a.startsAt) || (a.outcome === 'ended_poor_quality' && now >= windowOf(a).closes))
  if (!ok2) return err(409, 'CANNOT_RESCHEDULE', 'This visit can no longer be moved.')
  const [docId, startsAt] = String(b.slotId).split('_')
  const d = doctors[+docId]
  if (!d || !startsAt) return err(404, 'SLOT_NOT_FOUND', 'That time no longer exists. Choose another time.')
  if (d.id !== a.doctorId && d.groupIndex !== services.find((s) => s.id === a.serviceId)!.groupIndex) return err(400, 'SERVICE_MISMATCH', 'Choose the same doctor, or another doctor in the same area of care.')
  if (!slotsFor(d, lisbonDay(startsAt), 1).some((s) => s.startsAt === startsAt)) return err(409, 'SLOT_TAKEN', 'That time was just booked. Choose another time.')
  Object.assign(a, { doctorId: d.id, startsAt, endsAt: new Date(Date.parse(startsAt) + SLOT_MIN * 60000).toISOString(), outcome: null, callState: 'not_started', reconnects: 0, preJoin: null })
  mail(u.email, 'Your Carevia visit has a new time', `Your video consultation with ${d.name} has a new time.`, [`/app/visits/${a.id}`])
  return ok({ appointment: view(a) })
})
on('PUT', '/api/appointments/([^/]+)/reminders', (m, b) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  if (typeof b?.email !== 'boolean' || typeof b?.sms !== 'boolean') return err(400, 'VALIDATION', 'Check the submitted fields.')
  if (a.status !== 'confirmed') return err(409, 'NOT_CONFIRMED', 'Only a confirmed visit has reminders.')
  a.remind = { email: b.email, sms: b.sms }
  return ok({ appointment: view(a) })
})
on('POST', '/api/appointments/([^/]+)/pre-join', (m, b) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  if (b.emailConfirmed !== true || b.mobileConfirmed !== true) return err(400, 'VALIDATION', 'Please confirm your email and mobile number.')
  a.preJoin = { confirmedAt: new Date().toISOString(), companion: !!b.companion }
  return ok({ appointment: view(a) })
})
on('POST', '/api/appointments/([^/]+)/video-token', (m) => {
  const u = needRole('patient', 'clinician'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  if (a.status !== 'confirmed') return err(409, 'NOT_CONFIRMED', 'This visit is not open for a call.')
  const w = windowOf(a)
  if (Date.now() < w.opens) return err(425, 'TOO_EARLY', 'The visit opens 10 minutes before it starts.')
  if (Date.now() > w.closes) return err(410, 'WINDOW_CLOSED', 'The time to join this visit has passed.')
  if (u.role === 'patient' && !a.preJoin?.confirmedAt) return err(409, 'PRE_JOIN_REQUIRED', 'Please confirm your details before joining.')
  // ponytail: the mock cannot create Daily rooms, so it always shows the "video is off" state.
  return err(409, 'VIDEO_DISABLED', 'Video visits are switched off right now.')
})
on('POST', '/api/appointments/([^/]+)/call-events', (m, b) => {
  const u = needRole('patient', 'clinician'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  if (b.type === 'joined') a.callState = 'in_progress'
  if (b.type === 'reconnect') a.reconnects++
  return ok()
})
on('GET', '/api/video/status', () => ok({ enabled: false }))

on('GET', '/api/family', () => {
  const u = needRole('patient'); if (isRes(u)) return u
  return ok({ members: db().family.filter((f) => f.userId === u.id).map(strip) })
})
const strip = ({ userId: _u, ...m }: Fam): FamilyMember => m
function checkMember(b: any): Res | null {
  if (!b.firstName?.trim() || !b.lastName?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(b.dateOfBirth ?? '')) return err(400, 'VALIDATION', 'Please fill in every field.')
  const years = age(b.dateOfBirth)
  if (b.relationship === 'child' && years >= 18) return err(400, 'VALIDATION', 'A child must be under 18. Add them as an adult you care for instead.')
  if (b.relationship === 'adult' && years < 18) return err(400, 'VALIDATION', 'An adult must be 18 or over. Add them as your child instead.')
  return null
}
on('POST', '/api/family', (_, b) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const bad = checkMember(b); if (bad) return bad
  const f: Fam = { id: 'f-' + rid(), userId: u.id, firstName: b.firstName.trim(), lastName: b.lastName.trim(), dateOfBirth: b.dateOfBirth, relationship: b.relationship }
  db().family.push(f)
  return ok({ member: strip(f) }, 201)
})
on('PATCH', '/api/family/([^/]+)', (m, b) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const f = db().family.find((x) => x.id === m[1] && x.userId === u.id); if (!f) return err(404, 'NOT_FOUND', 'Not found.')
  const next = { ...f, ...b }
  const bad = checkMember(next); if (bad) return bad
  Object.assign(f, { firstName: next.firstName, lastName: next.lastName, dateOfBirth: next.dateOfBirth, relationship: next.relationship })
  return ok({ member: strip(f) })
})
on('DELETE', '/api/family/([^/]+)', (m) => {
  const u = needRole('patient'); if (isRes(u)) return u
  const i = db().family.findIndex((x) => x.id === m[1] && x.userId === u.id); if (i < 0) return err(404, 'NOT_FOUND', 'Not found.')
  if (db().appts.some((a) => a.familyMemberId === m[1] && a.status === 'confirmed' && windowOf(a).closes > Date.now()))
    return err(409, 'HAS_UPCOMING', 'This person has an upcoming visit. Cancel it first, then remove them.')
  db().family.splice(i, 1)
  return ok()
})
on('PATCH', '/api/me', (_, b) => {
  const u = needRole('patient'); if (isRes(u)) return u
  for (const k of ['firstName', 'lastName', 'phone'] as const) if (typeof b[k] === 'string' && b[k].trim()) u[k] = b[k].trim()
  return ok({ user: publicUser(u) })
})

on('GET', '/api/clinician/agenda', (_, __, q) => {
  const u = needRole('clinician'); if (isRes(u)) return u
  const day = q.get('date') || lisbonDay()
  const d = doctors[u.doctorId!]
  const list = db().appts.filter((a) => a.doctorId === d.id && lisbonDay(a.startsAt) === day && ['confirmed', 'completed', 'cancelled'].includes(a.status))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(view)
  const { groupIndex: _g, serviceId: _s, availabilityIndex: _a, ...doctor } = d
  return ok({ doctor, appointments: list })
})
on('POST', '/api/clinician/appointments/([^/]+)/outcome', (m, b) => {
  const u = needRole('clinician'); if (isRes(u)) return u
  const a = ownAppt(u, m[1]); if (isRes(a)) return a
  if (!['completed', 'ended_poor_quality', 'needs_in_person', 'no_show'].includes(b.outcome)) return err(400, 'VALIDATION', 'Choose an outcome.')
  if (a.status !== 'confirmed') return err(409, 'NOT_CONFIRMED', 'This visit is not open.')
  if (Date.now() < windowOf(a).opens) return err(425, 'TOO_EARLY', 'You can record an outcome once the visit has opened.')
  a.outcome = b.outcome
  a.status = b.outcome === 'ended_poor_quality' ? 'confirmed' : 'completed'
  if (a.status === 'completed') a.callState = 'ended'
  return ok({ appointment: view(a) })
})
on('GET', '/api/clinician/imed-link', () => {
  const u = needRole('clinician'); if (isRes(u)) return u
  return ok({ url: 'https://imed.pt/imed/home' })
})

on('GET', '/api/demo', () => ok({
  enabled: true,
  accounts: [
    { role: 'patient', email: 'patient@example.com', password: 'demo-password', label: 'Demo patient' },
    { role: 'clinician', email: 'doctor@carevia.test', password: 'doctor-demo-password', label: 'Dr Emma Laurent (doctor)' },
    { role: 'admin', email: 'admin@carevia.test', password: 'admin-demo-password', label: 'Admin' },
  ],
}))
on('POST', '/api/demo/reset', () => { const s = db().sessionUser; resetMock(); db().sessionUser = s; return ok() })
on('GET', '/api/dev/outbox', () => ok({ messages: db().outbox }))

export async function handle(method: string, path: string, body: any): Promise<Res> {
  await new Promise((r) => setTimeout(r, 180)) // enough to see loading states
  const url = new URL(path, 'http://mock')
  expireHolds()
  for (const [m, re, h] of routes) {
    if (m !== method) continue
    const match = re.exec(url.pathname)
    if (match) {
      const res = h(match, body ?? {}, url.searchParams)
      save()
      return JSON.parse(JSON.stringify(res))
    }
  }
  return err(404, 'NOT_FOUND', `Mock has no route for ${method} ${url.pathname}`)
}

/** The mock's calendar file, served as a blob because there is no server. */
export function mockIcs(id: string): string {
  const a = db().appts.find((x) => x.id === id)
  if (!a) return ''
  const v = view(a)
  const t = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Carevia//Demo//EN', 'BEGIN:VEVENT', `UID:${a.id}@carevia`, `DTSTAMP:${t(new Date().toISOString())}`,
    `DTSTART:${t(a.startsAt)}`, `DTEND:${t(a.endsAt)}`, `SUMMARY:Carevia video consultation with ${v.doctor.name}`,
    `URL:${location.origin}/app/visits/${a.id}`, `DESCRIPTION:Join from ${location.origin}/app/visits/${a.id}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
}

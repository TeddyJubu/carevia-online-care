// Smoke test for the running API. See README "Smoke and unit tests" for how to start the API for it.
//   Demo mode:   HOLD_LIMIT=1000 DEMO_MODE=true NODE_ENV=development DAILY_API_URL=http://127.0.0.1:4090/v1 npm run start
//   Normal mode: HOLD_LIMIT=1000 NODE_ENV=production DAILY_API_URL=http://127.0.0.1:4090/v1 npm run start
// The script starts a fake Daily on 127.0.0.1:4090, so no real Daily key or network call is needed for video.
// It uses Prisma directly once, to backdate a hold for the HOLD_EXPIRED check, and runs the reminder job itself
// with a simulated clock (same database) to check one reminder per visit.
import http from 'node:http'
import { prisma } from '../src/prisma.js'

const base = process.env.API_URL || 'http://127.0.0.1:4000'
const origin = process.env.SMOKE_ORIGIN || 'http://localhost:5180'
const FAKE_DAILY_PORT = Number(process.env.FAKE_DAILY_PORT) || 4090
const results = []
const stamp = Date.now()

function record(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---- Fake Daily: records requests, refuses the key "smoke-daily-refuses" ----
const daily = { rooms: [], tokens: [] }
const fakeDaily = http.createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    const json = body ? JSON.parse(body) : {}
    if (req.headers.authorization === 'Bearer smoke-daily-refuses') {
      res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"authentication-error"}')
      return
    }
    if (req.url === '/v1/rooms') {
      daily.rooms.push(json)
      const name = `rnd${daily.rooms.length}x${stamp.toString(36)}`
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ name, url: `https://fake.daily.co/${name}` }))
      return
    }
    if (req.url === '/v1/meeting-tokens') {
      daily.tokens.push(json.properties)
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ token: `fake-token-${daily.tokens.length}` }))
      return
    }
    res.writeHead(404).end()
  })
})
await new Promise((resolve) => fakeDaily.listen(FAKE_DAILY_PORT, '127.0.0.1', resolve))

// ---- A browser: its own cookie jar ----
class Browser {
  constructor() { this.cookies = new Map() }
  cookieHeader() { return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ') }
  has(name) { return this.cookies.has(name) }

  // Auth endpoints are rate limited (3 sign-ins per 10 s per IP), so this waits and retries on 429.
  async request(path, options = {}) {
    for (let attempt = 0; ; attempt += 1) {
      const result = await this.once(path, options)
      if (result.status !== 429 || options.noRetry || attempt > 5) return result
      await sleep((Number(result.headers.get('x-retry-after')) || 5) * 1000 + 250)
    }
  }

  // `origin: null` sends no Origin header; `headers` adds extra ones (e.g. Sec-Fetch-Site).
  async once(path, { method = 'GET', body, origin: from = origin, headers: extra = {} } = {}) {
    const headers = { ...(from ? { origin: from } : {}), ...extra }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const cookie = this.cookieHeader()
    if (cookie) headers.cookie = cookie
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';')
      const [key, ...rest] = pair.split('=')
      const value = rest.join('=')
      const expired = attributes.some((part) => /max-age=0\b/i.test(part.trim())) || value === ''
      if (expired) this.cookies.delete(key.trim())
      else this.cookies.set(key.trim(), value)
    }
    const text = await response.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
    return { status: response.status, json, text, headers: response.headers }
  }

  get(path) { return this.request(path) }
  post(path, body = {}) { return this.request(path, { method: 'POST', body }) }
  put(path, body) { return this.request(path, { method: 'PUT', body }) }
  patch(path, body) { return this.request(path, { method: 'PATCH', body }) }
  del(path) { return this.request(path, { method: 'DELETE' }) }

  signIn(email, password) { return this.post('/api/auth/sign-in/email', { email, password }) }
  signUp(fields) {
    return this.post('/api/auth/sign-up/email', {
      name: `${fields.firstName} ${fields.lastName}`,
      password: `Smoke-${stamp}-${Math.random().toString(36).slice(2)}-pw`,
      phone: '+351 912 000 000',
      dateOfBirth: '1990-05-20',
      ...fields,
    })
  }
}

const is = (result, status, code) => result.status === status && (code === undefined || result.json?.error === code || result.json?.code === code)
const show = (result) => `${result.status} ${result.json?.error || result.json?.code || ''}`.trim()

function expectError(name, result, status, code) {
  record(name, is(result, status, code), show(result))
}

const DEMO = { patient: ['patient@example.com', 'demo-password'], doctor: ['doctor@carevia.test', 'doctor-demo-password'], admin: ['admin@carevia.test', process.env.DEMO_ADMIN_PASSWORD] }

async function freeSlot(browser, { doctorId = 3, skip = 0 } = {}) {
  const slots = await browser.get(`/api/doctors/${doctorId}/slots?days=21`)
  return slots.json?.slots?.[skip]
}

async function catalogChecks(anon) {
  const health = await anon.get('/api/health')
  record('health', health.status === 200 && health.json?.ok === true, `status ${health.status}`)

  const services = await anon.get('/api/services')
  const groups = services.json?.groups || []
  const all = groups.flatMap((group) => group.services)
  record('services: 7 groups with slugs in order',
    groups.map((group) => group.slug).join() === 'general,mental,nutrition,specialist,certificates,treatments,renewals',
    groups.map((group) => group.slug).join())
  record('services: 55 services with stable ids 1-55', all.length === 55 && all.every((service, index) => service.id === index + 1), `count ${all.length}`)
  record('services: fromFee per group', groups.every((group) => Number.isInteger(group.fromFee)), String(groups[0]?.fromFee))
  const mens = groups[0]?.services?.[12]?.name
  record('Men’s health apostrophe U+2019', mens === 'Men’s health' && mens?.codePointAt(3) === 0x2019, mens)

  const doctors = await anon.get('/api/doctors')
  record('doctors: 270 with nextAvailableAt', doctors.json?.count === 270 &&doctors.json.doctors.every((doctor) => 'nextAvailableAt' in doctor), `count ${doctors.json?.count}`)
  const profile = (await anon.get('/api/doctors/0')).json?.doctor
  record('doctor 0 wireframe profile',
    profile?.name === 'Dr Emma Laurent' && profile?.initials === 'EL' && profile?.specialty === 'General practitioner'
      && profile?.fee === 45 && profile?.cedula === 'DEMO-CEDULA-0' && profile?.languages === 'English · French'
      && profile?.service === 'Adult urgent care' && profile?.groupSlug === 'general' && /Illustrative/.test(profile?.education),
    profile?.name)
  expectError('doctor not found is 404', await anon.get('/api/doctors/99999'), 404, 'NOT_FOUND')
  const emma = await anon.get('/api/doctors?q=Emma')
  record('search q=Emma', emma.json?.count === 11 && emma.json.doctors.every((doctor) => doctor.name.includes('Emma')), `count ${emma.json?.count}`)
  const filtered = await anon.get('/api/doctors?specialty=General%20practitioner&maxFee=45')
  record('filter specialty and maxFee', filtered.json?.count > 0
    && filtered.json.doctors.every((doctor) => doctor.specialty === 'General practitioner' && doctor.fee <= 45), `count ${filtered.json?.count}`)
  const bySlug = await anon.get('/api/doctors?groupSlug=mental&sort=first-available')
  const times = bySlug.json?.doctors?.map((doctor) => doctor.nextAvailableAt ? Date.parse(doctor.nextAvailableAt) : Infinity) || []
  record('groupSlug filter and sort=first-available', bySlug.json?.count === 60
    && bySlug.json.doctors.every((doctor) => doctor.groupSlug === 'mental') && times.every((time, i) => i === 0 || times[i - 1] <= time),
  `count ${bySlug.json?.count}`)
  expectError('invalid doctor filter is 400', await anon.get('/api/doctors?maxFee=cheap'), 400, 'INVALID_FILTER')

  const slots = await anon.get('/api/doctors/0/slots?days=7')
  const now = Date.now()
  record('doctor slots: future, ordered, 30 minutes, with ids', Array.isArray(slots.json?.slots) && slots.json.slots.length > 0
    && slots.json.slots.every((slot, i, list) => Number.isInteger(slot.id) && Date.parse(slot.startsAt) > now
      && Date.parse(slot.endsAt) - Date.parse(slot.startsAt) === 30 * 60_000 && (i === 0 || list[i - 1].startsAt < slot.startsAt)),
  `slots ${slots.json?.slots?.length}`)
  expectError('doctor slots with a bad date is 400', await anon.get('/api/doctors/0/slots?from=5-11-2026'), 400, 'VALIDATION')

  const first = await anon.get('/api/slots/first-available?groupSlug=general&limit=6')
  const firstTimes = first.json?.slots?.map((slot) => slot.startsAt) || []
  record('first-available: earliest first across doctors', firstTimes.length === 6
    && firstTimes.every((time, i) => i === 0 || firstTimes[i - 1] <= time) && first.json.slots.every((slot) => slot.doctor?.cedula?.startsWith('DEMO-CEDULA-')),
  `slots ${firstTimes.length}`)
  const byService = await anon.get('/api/slots/first-available?serviceId=15&language=Portuguese&limit=3')
  record('first-available: serviceId and language filters', byService.status === 200
    && byService.json.slots.every((slot) => slot.doctor.languages.includes('Portuguese')), `slots ${byService.json?.slots?.length}`)
  expectError('first-available with a bad limit is 400', await anon.get('/api/slots/first-available?limit=500'), 400, 'VALIDATION')
}

async function authChecks() {
  const browser = new Browser()
  const email = `smoke-${stamp}@example.com`
  const signedUp = await browser.signUp({ email, firstName: ' Smoke ', lastName: 'Tester', phone: '+351 912 345 678', role: 'admin' })
  const user = signedUp.json?.user
  record('sign-up starts a session; role cannot be chosen; phone becomes E.164',
    signedUp.status === 200 && user?.role === 'patient' && user?.phone === '+351912345678' && user?.firstName === 'Smoke'
      && user?.name === 'Smoke Tester' && browser.has('carevia.session_token') && !signedUp.text.includes('password'),
    `status ${signedUp.status}`)
  const session = await browser.get('/api/auth/get-session')
  const shape = session.json?.user || {}
  record('get-session returns the contract user fields',
    ['id', 'email', 'emailVerified', 'firstName', 'lastName', 'phone', 'dateOfBirth', 'role'].every((key) => key in shape)
      && shape.dateOfBirth === '1990-05-20', Object.keys(shape).join(','))

  const kid = new Browser()
  expectError('sign-up under 18 is 400 UNDERAGE', await kid.signUp({ email: `kid-${stamp}@example.com`, firstName: 'Kid', lastName: 'Smoke', dateOfBirth: '2012-01-01' }), 400, 'UNDERAGE')
  expectError('sign-up with a non-E.164 phone is 400 INVALID_PHONE', await kid.signUp({ email: `phone-${stamp}@example.com`, firstName: 'Phone', lastName: 'Smoke', phone: '912345678' }), 400, 'INVALID_PHONE')
  const pwned = await kid.signUp({ email: `pwned-${stamp}@example.com`, firstName: 'Pwned', lastName: 'Smoke', password: 'password123' })
  record('breached password is rejected with PASSWORD_COMPROMISED', is(pwned, 400, 'PASSWORD_COMPROMISED')
    && pwned.json?.message === 'This password has appeared in a data breach. Choose a different one.', show(pwned))

  const outbox = await browser.get('/api/dev/outbox')
  const verify = outbox.json?.messages?.find((message) => message.to === email && /Confirm your email/.test(message.subject))
  record('verification email in the outbox lands on /app/account?verified=1',
    Boolean(verify) && verify.links.some((link) => link.includes('/api/auth/verify-email?token=') && link.includes(encodeURIComponent('/app/account?verified=1'))),
    verify?.subject || 'none')

  const reset = await new Browser().post('/api/auth/request-password-reset', { email })
  const resetMail = (await browser.get('/api/dev/outbox')).json?.messages?.find((message) => message.to === email && /Reset/.test(message.subject))
  const token = resetMail?.links?.[0]?.match(/\/app\/reset-password\?token=([^&]+)/)?.[1]
  record('password reset email links to /app/reset-password?token=', reset.status === 200 && Boolean(token), resetMail?.links?.[0]?.replace(/token=.*/, 'token=…') || 'none')
  const newPassword = `Smoke-reset-${stamp}-pw`
  const done = await new Browser().post('/api/auth/reset-password', { token: decodeURIComponent(token || ''), newPassword })
  const again = await new Browser().signIn(email, newPassword)
  record('reset password, then sign in with the new password', done.status === 200 && again.status === 200, `reset ${done.status}, sign-in ${again.status}`)

  const out = await browser.post('/api/auth/sign-out')
  const after = await browser.get('/api/auth/get-session')
  record('sign out ends the session', out.status === 200 && after.json === null, `sign-out ${out.status}`)
  const wrong = await new Browser().signIn(email, 'not-the-password')
  record('wrong password is 401', wrong.status === 401, show(wrong))
  const oldLogin = await new Browser().post('/api/auth/login', { email, password: 'x' })
  const oldAdmin = await new Browser().post('/api/admin/login', { email, password: 'x' })
  record('old /api/auth/login and /api/admin/login are gone', oldLogin.status === 404 && oldAdmin.status === 404, `${oldLogin.status} ${oldAdmin.status}`)
}

async function bookingChecks(patient) {
  const anon = new Browser()
  const slot = await freeSlot(anon, { doctorId: 3 })
  const serviceId = 1 // Adult urgent care, group "general"; doctor 3 is in that group
  const hold = (browser, fields = {}) => browser.post('/api/bookings', {
    slotId: slot.id, serviceId, channel: 'video', for: 'self', inMainlandPortugal: true, ...fields,
  })

  expectError('booking outside mainland Portugal is 400 NOT_ELIGIBLE', await hold(anon, { inMainlandPortugal: false }), 400, 'NOT_ELIGIBLE')
  expectError('audio booking is 400 AUDIO_DISABLED', await hold(anon, { channel: 'audio' }), 400, 'AUDIO_DISABLED')
  expectError('booking with missing fields is 400 VALIDATION', await anon.post('/api/bookings', { slotId: slot.id }), 400, 'VALIDATION')
  expectError('booking an unknown slot is 404 SLOT_NOT_FOUND', await hold(anon, { slotId: 999999999 }), 404, 'SLOT_NOT_FOUND')
  expectError('booking a service the doctor does not offer is 400 SERVICE_MISMATCH', await hold(anon, { serviceId: 15 }), 400, 'SERVICE_MISMATCH')

  const held = await hold(anon)
  const appointment = held.json?.appointment
  const expiresIn = Date.parse(appointment?.holdExpiresAt) - Date.now()
  record('hold before sign-up: 201 held for 10 minutes with the carevia_hold cookie',
    held.status === 201 && appointment?.status === 'held' && expiresIn > 9 * 60_000 && expiresIn <= 10 * 60_000 && anon.has('carevia_hold')
      && appointment?.patient === null && appointment?.imed?.status === 'not_connected',
    show(held))
  const freeAfter = await anon.get(`/api/doctors/3/slots?days=21`)
  record('a held slot is no longer listed as free', !freeAfter.json.slots.some((item) => item.id === slot.id))
  expectError('holding a held slot from another browser is 409 SLOT_TAKEN', await hold(new Browser()), 409, 'SLOT_TAKEN')

  // Two browsers race for the same free slot: the database lets exactly one win.
  const race = await freeSlot(anon, { doctorId: 7 })
  const racers = await Promise.all([new Browser(), new Browser()].map((browser) =>
    browser.post('/api/bookings', { slotId: race.id, serviceId, channel: 'video', for: 'self', inMainlandPortugal: true })))
  const statuses = racers.map((result) => result.status).sort()
  record('two concurrent holds on one slot: one 201, one 409 SLOT_TAKEN',
    statuses.join() === '201,409' && racers.some((result) => result.json?.error === 'SLOT_TAKEN'), statuses.join())

  // A new hold by the same browser releases the previous one.
  const second = await freeSlot(anon, { doctorId: 3 })
  const moved = await anon.post('/api/bookings', { slotId: second.id, serviceId, channel: 'video', for: 'self', inMainlandPortugal: true })
  const listed = await anon.get(`/api/doctors/3/slots?days=21`)
  record('a new hold by the same browser releases its previous hold', moved.status === 201 && listed.json.slots.some((item) => item.id === slot.id), show(moved))
  const holdId = moved.json?.appointment?.id

  expectError('claim without a session is 401 AUTH_REQUIRED', await anon.post(`/api/bookings/${holdId}/claim`), 401, 'AUTH_REQUIRED')
  const email = `booker-${stamp}@example.com`
  await anon.signUp({ email, firstName: 'Booking', lastName: 'Smoke' })
  const other = new Browser()
  await other.signUp({ email: `other-${stamp}@example.com`, firstName: 'Other', lastName: 'Smoke' })
  expectError('claiming another browser’s hold is 404', await other.post(`/api/bookings/${holdId}/claim`), 404, 'NOT_FOUND')
  const claimed = await anon.post(`/api/bookings/${holdId}/claim`)
  record('claim attaches the hold to the new patient', claimed.status === 200 && claimed.json?.appointment?.patient?.displayName === 'Booking Smoke'
    && claimed.json.appointment.patient.kind === 'self', show(claimed))

  const consent = await anon.get('/api/consent/current')
  record('consent/current has version, title, body and recordingOffered false',
    consent.status === 200 && consent.json?.version && consent.json?.title && consent.json?.body && consent.json?.recordingOffered === false,
    consent.json?.version)
  expectError('pay before consent is 409 CONSENT_REQUIRED', await anon.post(`/api/bookings/${holdId}/pay`, { method: 'demo' }), 409, 'CONSENT_REQUIRED')
  expectError('stale consent version is 409 CONSENT_OUTDATED', await anon.post(`/api/bookings/${holdId}/consent`, { version: 'old' }), 409, 'CONSENT_OUTDATED')
  const consented = await anon.post(`/api/bookings/${holdId}/consent`, { version: consent.json.version })
  record('consent is stored with version and time', consented.status === 200 && consented.json?.appointment?.consent?.version === consent.json.version
    && consented.json.appointment.consent.acceptedAt, show(consented))
  expectError('pay with another method is 400 VALIDATION', await anon.post(`/api/bookings/${holdId}/pay`, { method: 'card' }), 400, 'VALIDATION')
  const paid = await anon.post(`/api/bookings/${holdId}/pay`, { method: 'demo' })
  record('demo payment confirms the visit', paid.status === 200 && paid.json?.appointment?.status === 'confirmed'
    && paid.json.appointment.payment?.status === 'paid' && paid.json.appointment.payment.method === 'demo' && paid.json.appointment.holdExpiresAt === null,
  show(paid))
  const confirmation = (await anon.get('/api/dev/outbox')).json?.messages?.find((m) => m.to === email && /booked/.test(m.subject))
  const startsAt = paid.json?.appointment?.startsAt
  const lisbonTime = startsAt && new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(startsAt))
  record('payment sends a confirmation: Lisbon time, doctor, link to /app/visits/:id, no patient name or reason',
    !!confirmation && confirmation.text.includes(paid.json.appointment.doctor.name) && confirmation.text.includes(`at ${lisbonTime}`)
      && confirmation.text.includes('Lisbon time') && confirmation.links.some((link) => link.endsWith(`/app/visits/${holdId}`))
      && !confirmation.text.includes('Booking Smoke') && !confirmation.text.includes(paid.json.appointment.service.name),
    confirmation ? confirmation.text : 'no message')
  expectError('releasing a confirmed visit is 409 NOT_HELD', await anon.del(`/api/bookings/${holdId}`), 409, 'NOT_HELD')
  expectError('another patient cannot read the visit (404)', await other.get(`/api/appointments/${holdId}`), 404, 'NOT_FOUND')
  const receipt = await anon.get(`/api/appointments/${holdId}/receipt.pdf`)
  record('receipt.pdf: the owner gets a 200 PDF download',
    receipt.status === 200 && receipt.headers.get('content-type') === 'application/pdf' && receipt.text.startsWith('%PDF-')
      && /attachment; filename="carevia-receipt-CV-\d{8}-\w{6}\.pdf"/.test(receipt.headers.get('content-disposition')) && /no-store/.test(receipt.headers.get('cache-control')),
    `${receipt.status} ${receipt.headers.get('content-type')}`)
  expectError('receipt.pdf: another patient gets 404', await other.get(`/api/appointments/${holdId}/receipt.pdf`), 404, 'NOT_FOUND')
  expectError('receipt.pdf: signed out is 401 AUTH_REQUIRED', await new Browser().get(`/api/appointments/${holdId}/receipt.pdf`), 401, 'AUTH_REQUIRED')

  const upcoming = await anon.get('/api/appointments?scope=upcoming')
  record('the new visit is in the patient’s upcoming list', upcoming.json?.appointments?.some((item) => item.id === holdId), `count ${upcoming.json?.appointments?.length}`)
  const ics = await anon.get(`/api/appointments/${holdId}/calendar.ics`)
  record('calendar.ics: text/calendar, doctor name, link, no patient name',
    ics.status === 200 && /text\/calendar/.test(ics.headers.get('content-type')) && ics.text.includes('SUMMARY:Carevia video consultation with Dr')
      && ics.text.includes(`/app/visits/${holdId}`) && !ics.text.includes('Booking Smoke') && ics.text.includes('BEGIN:VEVENT'),
    `status ${ics.status}`)
  const cancelled = await anon.post(`/api/appointments/${holdId}/cancel`)
  const freeAgain = await anon.get(`/api/doctors/3/slots?days=21`)
  record('cancel frees the slot', cancelled.json?.appointment?.status === 'cancelled' && freeAgain.json.slots.some((item) => item.id === second.id), show(cancelled))
  expectError('cancelling twice is 409 NOT_CONFIRMED', await anon.post(`/api/appointments/${holdId}/cancel`), 409, 'NOT_CONFIRMED')

  // Hold expiry: backdate a hold instead of waiting 10 minutes.
  const late = await anon.post('/api/bookings', { slotId: second.id, serviceId, channel: 'video', for: 'self', inMainlandPortugal: true })
  await prisma.appointment.update({ where: { id: late.json.appointment.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } })
  expectError('consent on an expired hold is 410 HOLD_EXPIRED', await anon.post(`/api/bookings/${late.json.appointment.id}/consent`, { version: consent.json.version }), 410, 'HOLD_EXPIRED')
  const rehold = await new Browser().post('/api/bookings', { slotId: second.id, serviceId, channel: 'video', for: 'self', inMainlandPortugal: true })
  record('an expired hold no longer blocks its slot', rehold.status === 201, show(rehold))
  const released = await new Browser().del(`/api/bookings/${rehold.json?.appointment?.id}`)
  record('another browser cannot release a hold (404)', released.status === 404, show(released))

  // Booking for a child, with the demo patient signed in (the hold is theirs straight away).
  const childSlot = await freeSlot(patient, { doctorId: 3, skip: 2 })
  const forChild = await patient.post('/api/bookings', { slotId: childSlot.id, serviceId: 4, channel: 'video', for: 'child', inMainlandPortugal: true })
  const childHold = forChild.json?.appointment?.id
  record('a signed-in patient’s hold needs no claim', forChild.status === 201 && forChild.json.appointment.for === 'child', show(forChild))
  expectError('child booking without a family member is 400 FAMILY_MEMBER_REQUIRED', await patient.put(`/api/bookings/${childHold}/patient`, { familyMemberId: null }), 400, 'FAMILY_MEMBER_REQUIRED')
  const family = await patient.get('/api/family')
  const leo = family.json?.members?.find((member) => member.firstName === 'Leo')
  const adult = await patient.post('/api/family', { firstName: 'Ana', lastName: 'Patient', dateOfBirth: '1960-02-01', relationship: 'adult' })
  expectError('an adult family member on a child booking is 400 FAMILY_MEMBER_MISMATCH',
    await patient.put(`/api/bookings/${childHold}/patient`, { familyMemberId: adult.json?.member?.id }), 400, 'FAMILY_MEMBER_MISMATCH')
  const set = await patient.put(`/api/bookings/${childHold}/patient`, { familyMemberId: leo?.id })
  record('choose the child for the booking', set.status === 200 && set.json?.appointment?.patient?.kind === 'family'
    && set.json.appointment.patient.displayName === 'Leo Patient', show(set))
  expectError('receipt.pdf for an unpaid hold is 409 NOT_PAID', await patient.get(`/api/appointments/${childHold}/receipt.pdf`), 409, 'NOT_PAID')
  const releasedChild = await patient.del(`/api/bookings/${childHold}`)
  record('release a hold', releasedChild.status === 200 && releasedChild.json?.ok === true, show(releasedChild))
  return { adultId: adult.json?.member?.id }
}

// Reschedule moves the same appointment; it never creates a second one.
// Doctor no-show (15 min past the start, no clinician "joined"): the patient may cancel or move; admin can override any time.
async function noShowChecks(admin) {
  const patient = new Browser()
  await patient.signUp({ email: `noshow-${stamp}@example.com`, firstName: 'Noshow', lastName: 'Smoke' })
  const version = (await patient.get('/api/consent/current')).json.version
  const book = async (skip) => {
    const slot = await freeSlot(patient, { doctorId: 3, skip })
    const id = (await patient.post('/api/bookings', { slotId: slot.id, serviceId: 1, channel: 'video', for: 'self', inMainlandPortugal: true })).json?.appointment?.id
    await patient.post(`/api/bookings/${id}/consent`, { version })
    await patient.post(`/api/bookings/${id}/pay`, { method: 'demo' })
    return id
  }
  // Moves a visit's own times (not its slot's) so it "started" `minutesAgo` minutes ago and lasts 30.
  const startedAgo = (id, minutesAgo) => prisma.appointment.update({
    where: { id }, data: { startsAt: new Date(Date.now() - minutesAgo * 60_000), endsAt: new Date(Date.now() - (minutesAgo - 30) * 60_000) },
  })
  const doctorJoins = (id) => prisma.callEvent.create({ data: { appointmentId: id, actorRole: 'clinician', type: 'joined' } })

  const a = await book(12)
  await startedAgo(a, 10)
  expectError('5 minutes late with no doctor: cancel is still 409 TOO_LATE_TO_CANCEL', await patient.post(`/api/appointments/${a}/cancel`), 409, 'TOO_LATE_TO_CANCEL')
  await startedAgo(a, 20)
  const view = await patient.get(`/api/appointments/${a}`)
  record('the visit shows call.doctorJoined false', view.json?.appointment?.call?.doctorJoined === false, show(view))
  const target = await freeSlot(patient, { doctorId: 3, skip: 14 })
  const moved = await patient.post(`/api/appointments/${a}/reschedule`, { slotId: target.id })
  record('doctor no-show: the patient moves the same visit to a new time', moved.status === 200 && moved.json.appointment.startsAt === target.startsAt, show(moved))
  await startedAgo(a, 20)
  await doctorJoins(a)
  expectError('the doctor joined: cancel stays 409', await patient.post(`/api/appointments/${a}/cancel`), 409, 'TOO_LATE_TO_CANCEL')
  expectError('the doctor joined: move stays 409 CANNOT_RESCHEDULE', await patient.post(`/api/appointments/${a}/reschedule`, { slotId: target.id }), 409, 'CANNOT_RESCHEDULE')
  await prisma.callEvent.deleteMany({ where: { appointmentId: a } })
  const cancelled = await patient.post(`/api/appointments/${a}/cancel`)
  record('doctor no-show: the patient cancels, cancelledBy patient', cancelled.status === 200 && cancelled.json.appointment.status === 'cancelled' && cancelled.json.appointment.cancelledBy === 'patient', show(cancelled))

  // Unresolved: join window closed, no outcome, doctor joined (so the patient can't act). Admin sees and fixes it.
  const b = await book(12)
  await startedAgo(b, 120)
  await doctorJoins(b)
  const attention = await admin.get('/api/admin/appointments?needsAttention=true')
  record('admin needsAttention lists a confirmed visit past its join window with no outcome',
    attention.status === 200 && attention.json.appointments.some((x) => x.id === b) && attention.json.appointments.every((x) => x.status === 'confirmed' && !x.outcome), show(attention))
  expectError('a patient cannot use the admin cancel (403)', await patient.post(`/api/admin/appointments/${b}/cancel`), 403, 'FORBIDDEN')
  const spot = await freeSlot(patient, { doctorId: 3, skip: 16 })
  const adminMoved = await admin.post(`/api/admin/appointments/${b}/reschedule`, { slotId: spot.id })
  record('admin moves a visit past its time (no time limit)', adminMoved.status === 200 && adminMoved.json.appointment.startsAt === spot.startsAt && !('patient' in adminMoved.json.appointment), show(adminMoved))
  const after = await admin.get('/api/admin/appointments?needsAttention=true')
  record('a moved visit leaves needsAttention', !after.json?.appointments?.some((x) => x.id === b))
  await startedAgo(b, 120)
  const adminCancelled = await admin.post(`/api/admin/appointments/${b}/cancel`)
  record('admin cancels a visit past its time, cancelledBy admin', adminCancelled.status === 200 && adminCancelled.json.appointment.cancelledBy === 'admin', show(adminCancelled))
  const note = (await patient.get('/api/dev/outbox')).json?.messages?.find((m) => /was cancelled/.test(m.subject) && m.links.some((link) => link.endsWith(`/app/visits/${b}`)))
  record('admin cancel emails the patient', !!note, note?.text ?? 'no message')
  expectError('admin cancelling twice is 409 NOT_CONFIRMED', await admin.post(`/api/admin/appointments/${b}/cancel`), 409, 'NOT_CONFIRMED')
}

async function rescheduleChecks(demoPatient) {
  // A new patient with a confirmed visit with doctor 3 (General & urgent care), so the demo patient's lists stay as seeded.
  const patient = new Browser()
  await patient.signUp({ email: `mover-${stamp}@example.com`, firstName: 'Mover', lastName: 'Smoke' })
  const consent = await patient.get('/api/consent/current')
  const first = await freeSlot(patient, { doctorId: 3, skip: 4 })
  const held = await patient.post('/api/bookings', { slotId: first.id, serviceId: 1, channel: 'video', for: 'self', inMainlandPortugal: true })
  const id = held.json?.appointment?.id
  await patient.post(`/api/bookings/${id}/consent`, { version: consent.json.version })
  const paid = await patient.post(`/api/bookings/${id}/pay`, { method: 'demo' })
  const before = (await patient.get('/api/appointments?scope=upcoming')).json?.appointments?.length

  const target = await freeSlot(patient, { doctorId: 3, skip: 6 })
  const moved = await patient.post(`/api/appointments/${id}/reschedule`, { slotId: target.id })
  const after = await patient.get('/api/appointments?scope=upcoming')
  const freed = (await patient.get('/api/doctors/3/slots?days=21')).json.slots.some((slot) => slot.id === first.id)
  record('reschedule moves the same appointment to the new slot and frees the old one',
    paid.status === 200 && moved.status === 200 && moved.json?.appointment?.id === id && moved.json.appointment.startsAt === target.startsAt
      && moved.json.appointment.status === 'confirmed' && moved.json.appointment.payment?.status === 'paid' && freed,
    show(moved))
  record('reschedule never creates a second appointment', after.json?.appointments?.length === before
    && after.json.appointments.filter((item) => item.id === id).length === 1, `${before} then ${after.json?.appointments?.length}`)
  const note = (await patient.get('/api/dev/outbox')).json?.messages?.find((m) => /new time/.test(m.subject) && m.links.some((link) => link.endsWith(`/app/visits/${id}`)))
  record('reschedule sends a "new time" message with the visit link', !!note, note?.text ?? 'no message')

  const taken = await freeSlot(patient, { doctorId: 3, skip: 8 })
  await new Browser().post('/api/bookings', { slotId: taken.id, serviceId: 1, channel: 'video', for: 'self', inMainlandPortugal: true })
  expectError('reschedule onto a held slot is 409 SLOT_TAKEN', await patient.post(`/api/appointments/${id}/reschedule`, { slotId: taken.id }), 409, 'SLOT_TAKEN')
  const elsewhere = await freeSlot(patient, { doctorId: 60 })
  expectError('reschedule to another area of care is 400 SERVICE_MISMATCH', await patient.post(`/api/appointments/${id}/reschedule`, { slotId: elsewhere.id }), 400, 'SERVICE_MISMATCH')

  const spare = await freeSlot(patient, { doctorId: 3, skip: 10 })
  expectError('rescheduling someone else’s appointment is 404', await demoPatient.post(`/api/appointments/${id}/reschedule`, { slotId: spare.id }), 404, 'NOT_FOUND')
  const past = (await demoPatient.get('/api/appointments?scope=past')).json?.appointments?.find((item) => item.status === 'completed')
  expectError('rescheduling a finished visit is 409 CANNOT_RESCHEDULE', await demoPatient.post(`/api/appointments/${past?.id}/reschedule`, { slotId: spare.id }), 409, 'CANNOT_RESCHEDULE')
}

// Reminder choices (owner only), the receipt's payment data, and one reminder per visit however often the job runs.
async function reminderChecks(demoPatient) {
  const patient = new Browser()
  await patient.signUp({ email: `remind-${stamp}@example.com`, firstName: 'Remindme', lastName: 'Smoke' })
  const consent = await patient.get('/api/consent/current')
  // A time more than two days away, so the reminder isn't due yet and the visit counts as booked well ahead.
  const slot = (await patient.get('/api/doctors/7/slots?days=21')).json.slots.find((s) => Date.parse(s.startsAt) > Date.now() + 48 * 3_600_000)
  const held = await patient.post('/api/bookings', { slotId: slot.id, serviceId: 1, channel: 'video', for: 'self', inMainlandPortugal: true })
  const id = held.json?.appointment?.id
  await patient.post(`/api/bookings/${id}/consent`, { version: consent.json.version })
  const paid = await patient.post(`/api/bookings/${id}/pay`, { method: 'demo' })
  const a = (await patient.get(`/api/appointments/${id}`)).json?.appointment
  record('reminders default to email on, SMS off, none sent', paid.status === 200 && a?.reminders?.email === true && a.reminders.sms === false && a.reminders.sentAt === null, JSON.stringify(a?.reminders))
  record('receipt data: amount, method, date paid and status, nothing else',
    a?.payment?.amount === a?.fee && a.payment.method === 'demo' && a.payment.status === 'paid' && !Number.isNaN(Date.parse(a.payment.paidAt))
      && Object.keys(a.payment).sort().join() === 'amount,method,paidAt,status',
    JSON.stringify(a?.payment))
  // The demo doctor (doctor 0) sees the demo patient's visits with her: no payment and no reminders in that view.
  const ownVisit = (await demoPatient.get('/api/appointments?scope=upcoming')).json?.appointments?.find((item) => item.doctor.id === 0)
  const doctorView = await (async () => { const d = new Browser(); await d.signIn(...DEMO.doctor); return d.get(`/api/appointments/${ownVisit?.id}`) })()
  record('a doctor never sees payment or reminders', doctorView.status === 200 && !('payment' in doctorView.json.appointment) && !('reminders' in doctorView.json.appointment), show(doctorView))

  const saved = await patient.put(`/api/appointments/${id}/reminders`, { email: true, sms: true })
  record('PUT reminders saves the choice', saved.status === 200 && saved.json?.appointment?.reminders?.sms === true && saved.json.appointment.reminders.email === true, show(saved))
  expectError('PUT reminders on another patient’s visit is 404', await demoPatient.put(`/api/appointments/${id}/reminders`, { email: false, sms: false }), 404, 'NOT_FOUND')
  expectError('PUT reminders without a session is 401', await new Browser().put(`/api/appointments/${id}/reminders`, { email: false, sms: false }), 401, 'AUTH_REQUIRED')
  expectError('PUT reminders with a non-boolean is 400', await patient.put(`/api/appointments/${id}/reminders`, { email: 'yes', sms: true }), 400, 'VALIDATION')
  expectError('PUT reminders missing a field is 400', await patient.put(`/api/appointments/${id}/reminders`, { email: true }), 400, 'VALIDATION')
  expectError('PUT reminders with an unknown field is 400', await patient.put(`/api/appointments/${id}/reminders`, { email: true, sms: true, when: '1h' }), 400, 'VALIDATION')
  const cancelled = (await demoPatient.get('/api/appointments?scope=past')).json?.appointments?.find((item) => item.status === 'cancelled')
  expectError('PUT reminders on a cancelled visit is 409 NOT_CONFIRMED', await demoPatient.put(`/api/appointments/${cancelled?.id}/reminders`, { email: true, sms: false }), 409, 'NOT_CONFIRMED')
  const noOrigin = await patient.request(`/api/appointments/${id}/reminders`, { method: 'PUT', body: { email: true, sms: true }, origin: 'https://evil.example' })
  expectError('PUT reminders from another origin is 403 FORBIDDEN_ORIGIN', noOrigin, 403, 'FORBIDDEN_ORIGIN')

  // Run the job as if it were 23 hours before the visit, twice. The smoke process shares the API's database;
  // DEMO_MODE is set first so this process writes to the outbox too (the API is in demo mode to get here).
  process.env.DEMO_MODE = 'true'
  const { sendDueReminders } = await import('../src/reminders.js')
  const at = new Date(Date.parse(a.startsAt) - 23 * 3_600_000)
  // The job's counts cover every visit in the database (demo visits too), so "nothing yet" is checked on this visit's own messages.
  const reminders = async () => (await patient.get('/api/dev/outbox')).json.messages.filter((m) => /^Reminder|^SMS/.test(m.subject) && m.links.some((link) => link.endsWith(`/app/visits/${id}`)))
  await sendDueReminders(new Date(Date.parse(a.startsAt) - 25 * 3_600_000))
  const notYet = (await reminders()).length
  const first = await sendDueReminders(at)
  const second = await sendDueReminders(new Date(at.getTime() + 5 * 60_000))
  const mine = await reminders()
  const email = mine.find((m) => m.channel === 'email')
  const sms = mine.find((m) => m.channel === 'sms')
  record('reminders: nothing 25 hours before; one email and one SMS at 23 hours; nothing on the next run',
    notYet === 0 && first >= 1 && second === 0 && mine.length === 2 && !!email && !!sms, `${notYet}/${first}/${second}, ${mine.length} messages`)
  record('reminder text: Lisbon time, doctor and 112; no patient name',
    !!email && /Lisbon time/.test(email.text) && email.text.includes(a.doctor.name) && /112/.test(email.text) && !/Remindme|Smoke/.test(email.text + email.subject)
      && !!sms && sms.to === '+351912000000' && /not sent/.test(sms.subject) && !/Remindme|Smoke/.test(sms.text),
    email?.text)
  const after = (await patient.get(`/api/appointments/${id}`)).json?.appointment
  record('reminders: the sent time is stored', !!after?.reminders?.sentAt, String(after?.reminders?.sentAt))
  const target = (await patient.get('/api/doctors/7/slots?days=21')).json.slots.find((s) => Date.parse(s.startsAt) > Date.parse(a.startsAt) + 24 * 3_600_000)
  const moved = await patient.post(`/api/appointments/${id}/reschedule`, { slotId: target.id })
  record('moving a visit clears the sent reminder, so the new time gets one', moved.status === 200 && moved.json?.appointment?.reminders?.sentAt === null, show(moved))
}

async function clashChecks() {
  // One person can't be in two calls: their other visit's time is hidden, and refused at hold, payment and reschedule.
  const patient = new Browser()
  await patient.signUp({ email: `clash-${stamp}@example.com`, firstName: 'Clash', lastName: 'Smoke' })
  const version = (await patient.get('/api/consent/current')).json.version
  const book = async (slot) => {
    const id = (await patient.post('/api/bookings', { slotId: slot.id, serviceId: 1, channel: 'video', for: 'self', inMainlandPortugal: true })).json?.appointment?.id
    await patient.post(`/api/bookings/${id}/consent`, { version })
    return { id, paid: await patient.post(`/api/bookings/${id}/pay`, { method: 'demo' }) }
  }
  // Two doctors offering service 1 who are both free at the same time.
  const slots = (await patient.get('/api/slots/first-available?serviceId=1&limit=50')).json?.slots ?? []
  const a = slots.find((x) => slots.some((y) => y.startsAt === x.startsAt && y.doctor.id !== x.doctor.id))
  const b = a && slots.find((y) => y.startsAt === a.startsAt && y.doctor.id !== a.doctor.id)
  if (!a || !b) return record('clash checks need two doctors free at the same time', false, `${slots.length} slots`)
  const first = await book(a)
  const listed = (await patient.get(`/api/doctors/${b.doctor.id}/slots?days=21&for=self`)).json?.slots ?? []
  record('your times (for=self) leave out a time you already have a visit at', first.paid.status === 200 && listed.length > 0 && !listed.some((x) => x.id === b.id), `${listed.length} slots`)
  const strangers = (await new Browser().get(`/api/doctors/${b.doctor.id}/slots?days=21&for=self`)).json?.slots ?? []
  record('another patient still sees that other doctor’s time', strangers.some((x) => x.id === b.id), `${strangers.length} slots`)
  expectError('holding a second visit for yourself at the same time is 409 TIME_CLASH', await patient.post('/api/bookings', { slotId: b.id, serviceId: 1, channel: 'video', for: 'self', inMainlandPortugal: true }), 409, 'TIME_CLASH')
  const later = slots.find((x) => x.startsAt !== a.startsAt && x.doctor.id === b.doctor.id) ?? (await freeSlot(patient, { doctorId: b.doctor.id, skip: 3 }))
  const third = await book(later)
  const moveTo = (await patient.get(`/api/doctors/${b.doctor.id}/slots?days=21&visit=${third.id}`)).json?.slots ?? []
  record('reschedule times (visit=) leave out the person’s other visit time', moveTo.length > 0 && !moveTo.some((x) => x.id === b.id), `${moveTo.length} slots`)
  expectError('rescheduling onto the same person’s other visit time is 409 TIME_CLASH', await patient.post(`/api/appointments/${third.id}/reschedule`, { slotId: b.id }), 409, 'TIME_CLASH')
}

async function familyAndProfileChecks(patient, { adultId }) {
  expectError('family endpoints need a session (401)', await new Browser().get('/api/family'), 401, 'AUTH_REQUIRED')
  expectError('a "child" born in 1990 is 400 VALIDATION', await patient.post('/api/family', { firstName: 'Old', lastName: 'Child', dateOfBirth: '1990-01-01', relationship: 'child' }), 400, 'VALIDATION')
  expectError('an "adult" born in 2020 is 400 VALIDATION', await patient.post('/api/family', { firstName: 'Young', lastName: 'Adult', dateOfBirth: '2020-01-01', relationship: 'adult' }), 400, 'VALIDATION')
  const patched = await patient.patch(`/api/family/${adultId}`, { firstName: 'Anabela' })
  record('edit a family member', patched.status === 200 && patched.json?.member?.firstName === 'Anabela', show(patched))
  const leo = (await patient.get('/api/family')).json.members.find((member) => member.firstName === 'Leo')
  expectError('deleting a member with an upcoming visit is 409 HAS_UPCOMING', await patient.del(`/api/family/${leo.id}`), 409, 'HAS_UPCOMING')
  const removed = await patient.del(`/api/family/${adultId}`)
  const after = await patient.get('/api/family')
  record('delete a family member', removed.status === 200 && !after.json.members.some((member) => member.id === adultId), show(removed))

  expectError('PATCH /api/me with a bad phone is 400 INVALID_PHONE', await patient.patch('/api/me', { phone: '12' }), 400, 'INVALID_PHONE')
  const me = await patient.patch('/api/me', { phone: '+351 900 000 000', firstName: 'Demo' })
  record('PATCH /api/me updates name and phone', me.status === 200 && me.json?.user?.phone === '+351900000000', show(me))
  expectError('PATCH /api/me cannot change the birth date (400)', await patient.patch('/api/me', { dateOfBirth: '2010-01-01' }), 400, 'VALIDATION')
}

async function visitChecks(patient, doctor, admin) {
  const upcoming = (await patient.get('/api/appointments?scope=upcoming')).json?.appointments || []
  const past = (await patient.get('/api/appointments?scope=past')).json?.appointments || []
  const today = upcoming.find((item) => item.for === 'self' && item.doctor.id === 0)
  const childVisit = upcoming.find((item) => item.for === 'child')
  record('demo upcoming: today’s visit and the child’s visit with Dr Emma Laurent',
    Boolean(today) && Boolean(childVisit) && today.status === 'confirmed' && today.payment?.method === 'demo' && today.consent?.version
      && childVisit.patient?.displayName === 'Leo Patient', `count ${upcoming.length}`)
  record('demo past: completed, needs_in_person and cancelled, newest first',
    past.length === 3 && past.map((item) => item.outcome || item.status).sort().join() === 'cancelled,completed,needs_in_person'
      && past.every((item, i) => i === 0 || past[i - 1].startsAt >= item.startsAt), past.map((item) => item.outcome || item.status).join())
  const opens = Date.parse(today.call.joinOpensAt)
  record('join window is 10 minutes before start to 60 minutes after end',
    Date.parse(today.startsAt) - opens === 10 * 60_000 && Date.parse(today.call.joinClosesAt) - Date.parse(today.endsAt) === 60 * 60_000)
  expectError('appointments need a session (401 AUTH_REQUIRED)', await new Browser().get('/api/appointments'), 401, 'AUTH_REQUIRED')
  expectError('a clinician cannot list patient appointments (403)', await doctor.get('/api/appointments'), 403, 'FORBIDDEN')

  // Video
  const status = await patient.get('/api/video/status')
  record('video status is disabled without a key', status.json?.enabled === false && Object.keys(status.json).join() === 'enabled')
  const token = (id, browser = patient, body = {}) => browser.post(`/api/appointments/${id}/video-token`, body)
  expectError('patient video token before pre-join is 409 PRE_JOIN_REQUIRED', await token(today.id), 409, 'PRE_JOIN_REQUIRED')
  expectError('pre-join without both confirmations is 400 CONFIRMATION_REQUIRED',
    await patient.post(`/api/appointments/${today.id}/pre-join`, { emailConfirmed: true, mobileConfirmed: false, companion: false }), 400, 'CONFIRMATION_REQUIRED')
  const preJoin = await patient.post(`/api/appointments/${today.id}/pre-join`, { emailConfirmed: true, mobileConfirmed: true, companion: true })
  record('pre-join stores the time and the companion choice', preJoin.status === 200 && preJoin.json?.appointment?.preJoin?.confirmedAt
    && preJoin.json.appointment.preJoin.companion === true, show(preJoin))
  expectError('video token without a Daily key is 409 VIDEO_DISABLED', await token(today.id), 409, 'VIDEO_DISABLED')

  const fakeKey = `smoke-not-a-real-daily-key-${stamp}`
  const saved = await admin.put('/api/admin/daily', { apiKey: fakeKey })
  const hidden = await admin.get('/api/admin/daily')
  record('admin saves a Daily key; only the last four characters come back', saved.json?.enabled === true && saved.json?.hint === fakeKey.slice(-4)
    && !saved.text.includes(fakeKey) && !hidden.text.includes(fakeKey) && (await patient.get('/api/video/status')).json?.enabled === true)
  expectError('a patient cannot read the Daily settings (403)', await patient.get('/api/admin/daily'), 403, 'FORBIDDEN')

  await patient.post(`/api/appointments/${childVisit.id}/pre-join`, { emailConfirmed: true, mobileConfirmed: true, companion: false })
  expectError('companion token without a declared companion is 409 COMPANION_NOT_CONFIRMED', await token(childVisit.id, patient, { companion: true }), 409, 'COMPANION_NOT_CONFIRMED')
  expectError('video token before the join window is 425 TOO_EARLY', await token(childVisit.id), 425, 'TOO_EARLY')
  expectError('video token for a completed visit is 410 WINDOW_CLOSED', await token(past.find((item) => item.status === 'completed').id), 410, 'WINDOW_CLOSED')
  expectError('video token for a cancelled visit is 409 NOT_CONFIRMED', await token(past.find((item) => item.status === 'cancelled').id), 409, 'NOT_CONFIRMED')
  expectError('an admin cannot get a video token (403)', await token(today.id, admin), 403, 'FORBIDDEN')

  const patientToken = await token(today.id)
  const companionToken = await token(today.id, patient, { companion: true })
  const doctorToken = await token(today.id, doctor)
  const [p, c, d] = daily.tokens.slice(-3)
  const sameRoom = patientToken.json?.roomName && patientToken.json.roomName === doctorToken.json?.roomName && companionToken.json?.roomName === patientToken.json.roomName
  record('video tokens: patient and companion are participants, the doctor is owner, one shared room',
    patientToken.status === 200 && companionToken.status === 200 && doctorToken.status === 200 && sameRoom
      && p?.is_owner === false && c?.is_owner === false && d?.is_owner === true && p.user_name === 'Patient' && c.user_name === 'Companion'
      && patientToken.json.token !== companionToken.json.token,
    `${show(patientToken)} / ${show(companionToken)} / ${show(doctorToken)}`)
  const room = daily.rooms.at(-1)
  const sentToDaily = JSON.stringify(daily)
  record('Daily room: private, expires with the join window, no recording, no patient identifiers',
    daily.rooms.length === 1 && room.privacy === 'private' && room.properties.eject_at_room_exp === true
      && room.properties.exp === Math.floor(Date.parse(today.call.joinClosesAt) / 1000) && !('enable_recording' in room.properties)
      && !/Demo|Patient Smoke|example\.com|\+351|1990-01-01/.test(sentToDaily.replace(/"user_name":"(Patient|Companion)"/g, '')),
    `rooms ${daily.rooms.length}`)
  record('tokens are limited to the join window', [p, c, d].every((item) => item.nbf === Math.floor(opens / 1000)
    && item.exp === Math.floor(Date.parse(today.call.joinClosesAt) / 1000) && item.eject_at_token_exp === true))

  await admin.put('/api/admin/daily', { apiKey: 'smoke-daily-refuses' })
  const refused = await token(today.id)
  const stillUp = await patient.get('/api/health')
  record('Daily refusing the key is 502 DAILY_ERROR and the API stays up', is(refused, 502, 'DAILY_ERROR') && stillUp.status === 200, show(refused))
  const cleared = await admin.put('/api/admin/daily', { apiKey: '' })
  record('clearing the key turns video off', cleared.json?.enabled === false && (await patient.get('/api/video/status')).json?.enabled === false)

  // Call events: a drop keeps the same appointment.
  const event = (type, browser = patient) => browser.post(`/api/appointments/${today.id}/call-events`, { type })
  const joined = await event('joined')
  const left = await event('left')
  const reconnect = await event('reconnect')
  const doctorJoined = await event('joined', doctor)
  record('call events: joined, a drop, then reconnect on the same appointment',
    joined.json?.call?.state === 'in_progress' && left.json?.call?.state === 'in_progress' && reconnect.json?.call?.reconnects === 1
      && doctorJoined.status === 200, `${joined.json?.call?.state} ${reconnect.json?.call?.reconnects}`)
  expectError('unknown call event type is 400 VALIDATION', await event('recording_started'), 400, 'VALIDATION')

  return { today, childVisit }
}

async function catalogAdminChecks(patient, admin) {
  expectError('a patient cannot list admin patients (403)', await patient.get('/api/admin/patients'), 403, 'FORBIDDEN')
  const found = await admin.get('/api/admin/patients?q=patient@example.com')
  record('admin finds a patient; no password data', found.status === 200 && found.json.patients.some((p) => p.email === 'patient@example.com') && !/password/i.test(found.text), show(found))

  const schedule = await admin.get('/api/admin/doctors/11/slots')
  record('admin schedule lists only future open times', schedule.status === 200 && schedule.json.slots.length > 0 && schedule.json.slots.every((slot) => Date.parse(slot.startsAt) > Date.now() && slot.day && slot.time), show(schedule))
  expectError('admin cannot add a past time (400 SLOT_PAST)', await admin.post('/api/admin/doctors/11/slots', { date: '2020-01-15', time: '09:00' }), 400, 'SLOT_PAST')

  // Past the 21-day rolling schedule, so the time is free.
  const date = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const visible = async () => (await patient.get(`/api/doctors/11/slots?from=${date}&days=1`)).json?.slots?.length ?? -1
  const added = await admin.post('/api/admin/doctors/11/slots', { date, time: '08:00' })
  const slotId = added.json?.slot?.id
  record('admin adds a time; patients see it', added.status === 201 && await visible() === 1, show(added))
  expectError('an overlapping time is refused (409 SLOT_EXISTS)', await admin.post('/api/admin/doctors/11/slots', { date, time: '08:15' }), 409, 'SLOT_EXISTS')
  const removed = await admin.del(`/api/admin/doctors/11/slots/${slotId}`)
  record('admin removes a time; patients no longer see it', removed.status === 200 && await visible() === 0, show(removed))
  const reopened = await admin.post('/api/admin/doctors/11/slots', { date, time: '08:00' })
  record('adding a removed time opens the same slot again', reopened.status === 201 && reopened.json.slot.id === slotId, show(reopened))
  const hold = await patient.post('/api/bookings', { slotId, serviceId: 1, channel: 'video', for: 'self', inMainlandPortugal: true })
  expectError('a held time cannot be removed (409 SLOT_BOOKED)', await admin.del(`/api/admin/doctors/11/slots/${slotId}`), 409, 'SLOT_BOOKED')
  await patient.del(`/api/bookings/${hold.json?.appointment?.id}`)
  await admin.del(`/api/admin/doctors/11/slots/${slotId}`)

  const { doctor } = (await admin.get('/api/admin/doctors/11')).json
  const fields = ({ active, ...rest }) => Object.fromEntries(Object.entries(rest).filter(([key]) => ['name', 'specialty', 'languages', 'fee', 'experience', 'education', 'approach', 'cedula', 'groupId', 'serviceId'].includes(key)))
  const off = await admin.patch('/api/admin/doctors/11', { ...fields(doctor), active: false })
  const open = await freeSlot(patient, { doctorId: 12 })
  const closedSlot = (await admin.get('/api/admin/doctors/11/slots')).json.slots[0]
  record('a switched-off doctor is hidden from patients', off.status === 200 && (await patient.get('/api/doctors/11')).status === 404
    && !(await patient.get('/api/doctors')).json.doctors.some((d) => d.id === 11), show(off))
  expectError('a switched-off doctor cannot be booked (409 SLOT_TAKEN)', await patient.post('/api/bookings', { slotId: closedSlot.id, serviceId: 1, channel: 'video', for: 'self', inMainlandPortugal: true }), 409, 'SLOT_TAKEN')
  await admin.patch('/api/admin/doctors/11', { ...fields(doctor), active: true })

  const serviceOff = await admin.patch('/api/admin/services/1', { active: false })
  const listed = (await patient.get('/api/services')).json.groups.flatMap((g) => g.services.map((item) => item.id))
  record('a switched-off service leaves the menu', serviceOff.status === 200 && !listed.includes(1), show(serviceOff))
  expectError('a switched-off service cannot be booked (404)', await patient.post('/api/bookings', { slotId: open.id, serviceId: 1, channel: 'video', for: 'self', inMainlandPortugal: true }), 404, 'SERVICE_NOT_FOUND')
  await admin.patch('/api/admin/services/1', { active: true })
}

async function staffChecks(patient, doctor, admin, { today, childVisit }) {
  const agenda = await doctor.get('/api/clinician/agenda')
  const entry = agenda.json?.appointments?.find((item) => item.id === today.id)
  record('clinician agenda: today’s visit with the patient display name and call state, no payment',
    agenda.status === 200 && agenda.json.doctor?.id === 0 && entry?.patient?.displayName === 'Demo Patient' && entry.call?.state === 'in_progress'
      && !('payment' in entry), `count ${agenda.json?.appointments?.length}`)
  const other = await doctor.get(`/api/clinician/agenda?date=${childVisit.startsAt.slice(0, 10)}`)
  record('clinician agenda for another date', other.status === 200 && Array.isArray(other.json.appointments))
  expectError('clinician agenda with a bad date is 400', await doctor.get('/api/clinician/agenda?date=tomorrow'), 400, 'VALIDATION')
  expectError('a patient cannot open the clinician agenda (403)', await patient.get('/api/clinician/agenda'), 403, 'FORBIDDEN')
  const detail = await doctor.get(`/api/appointments/${today.id}`)
  record('clinician reads the visit (no payment field)', detail.status === 200 && !('payment' in detail.json.appointment))

  const outcome = (id, value) => doctor.post(`/api/clinician/appointments/${id}/outcome`, { outcome: value })
  expectError('outcome before the visit is 425 TOO_EARLY', await outcome(childVisit.id, 'completed'), 425, 'TOO_EARLY')
  expectError('outcome with free text is 400 VALIDATION', await doctor.post(`/api/clinician/appointments/${today.id}/outcome`, { outcome: 'completed', reason: 'x' }), 400, 'VALIDATION')
  const poor = await outcome(today.id, 'ended_poor_quality')
  record('ended_poor_quality keeps the visit confirmed for a reconnect', poor.json?.appointment?.status === 'confirmed'
    && poor.json.appointment.outcome === 'ended_poor_quality', show(poor))
  const completed = await outcome(today.id, 'completed')
  record('completed outcome completes the visit', completed.json?.appointment?.status === 'completed' && completed.json.appointment.call.state === 'ended', show(completed))
  expectError('a second outcome is 409 NOT_CONFIRMED', await outcome(today.id, 'no_show'), 409, 'NOT_CONFIRMED')
  const imed = await doctor.get('/api/clinician/imed-link')
  record('iMED link', imed.json?.url === 'https://imed.pt/imed/home', imed.json?.url)
  expectError('a patient cannot get the iMED link (403)', await patient.get('/api/clinician/imed-link'), 403, 'FORBIDDEN')

  // The doctor's own open times (web /app/doctor/profile).
  const schedule = await doctor.get('/api/clinician/schedule')
  const free = schedule.json?.slots?.find((s) => s.open && !s.booked)
  record('clinician schedule: own profile and upcoming times, no login id or patient names',
    schedule.status === 200 && schedule.json.doctor?.id === 0 && free && !('clinicianUserId' in schedule.json.doctor)
      && !/Demo Patient|patient@example\.com/.test(schedule.text), show(schedule))
  const closed = await doctor.del(`/api/clinician/slots/${free.id}`)
  const after = await doctor.get('/api/clinician/schedule')
  record('clinician removes a free time', closed.status === 200 && after.json.slots.find((s) => s.id === free.id)?.open === false, show(closed))
  const lisbon = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' }).format(new Date(free.startsAt)).split(' ')
  const reopened = await doctor.post('/api/clinician/slots', { date: lisbon[0], time: lisbon[1] })
  record('clinician opens a removed time again (same slot)', reopened.status === 201 && reopened.json.slot.id === free.id, show(reopened))
  expectError('clinician cannot open an overlapping time (409)', await doctor.post('/api/clinician/slots', { date: lisbon[0], time: lisbon[1] }), 409, 'SLOT_EXISTS')
  const taken = schedule.json.slots.find((s) => s.booked)
  if (taken) expectError('clinician cannot remove a booked time (409)', await doctor.del(`/api/clinician/slots/${taken.id}`), 409, 'SLOT_BOOKED')
  expectError('a clinician cannot remove another doctor’s time (404)', await doctor.del(`/api/clinician/slots/${(await freeSlot(patient)).id}`), 404, 'NOT_FOUND')
  expectError('a patient cannot open the clinician schedule (403)', await patient.get('/api/clinician/schedule'), 403, 'FORBIDDEN')

  const list = await admin.get(`/api/admin/appointments?date=${today.startsAt.slice(0, 10)}`)
  const row = list.json?.appointments?.find((item) => item.id === today.id)
  record('admin appointments: operational fields, no patient details',
    list.status === 200 && row && ['id', 'status', 'outcome', 'startsAt', 'service', 'doctor', 'call', 'payment'].every((key) => key in row)
      && !('patient' in row) && !/Demo Patient|patient@example\.com|\+351900000000|1990-01-01|dateOfBirth|phone|email/.test(list.text),
    `count ${list.json?.appointments?.length}`)
  expectError('admin appointments with a bad status is 400', await admin.get('/api/admin/appointments?status=paid'), 400, 'VALIDATION')
  expectError('a patient cannot list admin appointments (403)', await patient.get('/api/admin/appointments'), 403, 'FORBIDDEN')
  const log = await admin.get(`/api/admin/access-log?appointmentId=${today.id}`)
  const endpoints = new Set(log.json?.entries?.map((item) => `${item.actorRole} ${item.endpoint}`))
  record('access log records clinician and admin reads',
    endpoints.has('clinician GET /api/clinician/agenda') && endpoints.has('clinician GET /api/appointments/:id') && endpoints.has('admin GET /api/admin/appointments'),
    [...endpoints].join(' | '))
}

// CSRF: a cookie-carrying change from a sibling subdomain is refused; the same request from Carevia works.
async function originChecks(patient, production) {
  const body = { firstName: 'Demo' }
  const foreign = await patient.request('/api/me', { method: 'PATCH', body, origin: 'https://evil.triplelabs.dev' })
  const trusted = await patient.request('/api/me', { method: 'PATCH', body })
  record('a change from a foreign Origin is 403 FORBIDDEN_ORIGIN; the same change from the trusted origin works',
    is(foreign, 403, 'FORBIDDEN_ORIGIN') && trusted.status === 200, `${show(foreign)} / ${show(trusted)}`)
  const crossSite = await patient.request('/api/me', { method: 'PATCH', body, origin: null, headers: { 'sec-fetch-site': 'same-site' } })
  const sameOrigin = await patient.request('/api/me', { method: 'PATCH', body, origin: null, headers: { 'sec-fetch-site': 'same-origin' } })
  record('without Origin: Sec-Fetch-Site same-site is refused, same-origin works', is(crossSite, 403, 'FORBIDDEN_ORIGIN') && sameOrigin.status === 200,
    `${show(crossSite)} / ${show(sameOrigin)}`)
  const bare = await patient.request('/api/me', { method: 'PATCH', body, origin: null })
  record(`without Origin or Sec-Fetch-Site: ${production ? 'refused in production' : 'allowed outside production'}`,
    production ? is(bare, 403, 'FORBIDDEN_ORIGIN') : bare.status === 200, show(bare))
}

async function rateLimitCheck() {
  const browser = new Browser()
  const statuses = []
  for (let i = 0; i < 5; i += 1) {
    statuses.push((await browser.request('/api/auth/sign-in/email', { method: 'POST', body: { email: `nobody-${stamp}@example.com`, password: 'wrong-password' }, noRetry: true })).status)
  }
  record('sign-in is rate limited (429)', statuses.includes(429), statuses.join(' '))
}

try {
  const anon = new Browser()
  const demo = await anon.get('/api/demo')
  const demoMode = demo.status === 200

  await catalogChecks(anon)

  if (demoMode) {
    console.log('\nDemo mode is on.\n')
    record('GET /api/demo lists the patient and doctor, never the admin', demo.json?.enabled === true
      && demo.json.accounts.map((account) => account.role).join() === 'patient,clinician', demo.json?.accounts?.map((a) => a.email).join())
    if (!DEMO.admin[1]) throw new Error('Set DEMO_ADMIN_PASSWORD (the API\'s demo admin password) to run the smoke.')
    const admin = new Browser()
    const patient = new Browser()
    const doctor = new Browser()
    await admin.signIn(...DEMO.admin)
    expectError('demo reset needs an admin (403 for a patient)', await (async () => { await patient.signIn(...DEMO.patient); return patient.post('/api/demo/reset', {}) })(), 403, 'FORBIDDEN')
    // Start the "today" visit 5 minutes from now, so its join window is already open.
    const reset = await admin.post('/api/demo/reset', { startsInMinutes: 5 })
    record('admin demo reset', reset.status === 200 && reset.json?.ok === true, show(reset))
    // Reset keeps the demo accounts' ids and sessions.
    await doctor.signIn(...DEMO.doctor)
    const session = await patient.get('/api/auth/get-session')
    record('demo accounts keep their sessions across a reset', session.json?.user?.email === 'patient@example.com')

    await authChecks()
    const extra = await bookingChecks(patient)
    await familyAndProfileChecks(patient, extra)
    await rescheduleChecks(patient)
    await noShowChecks(admin)
    await reminderChecks(patient)
    await clashChecks()
    const visits = await visitChecks(patient, doctor, admin)
    await staffChecks(patient, doctor, admin, visits)
    await catalogAdminChecks(patient, admin)
    await originChecks(patient, false)
    const outbox = await anon.get('/api/dev/outbox')
    record('dev outbox lists messages newest first', outbox.status === 200 && outbox.json.messages.every((m, i, all) => i === 0 || all[i - 1].sentAt >= m.sentAt))
    await rateLimitCheck()
    // Leave the demo as a fresh reset (today's visit about 15 minutes away).
    const final = await admin.post('/api/demo/reset', {})
    record('final demo reset', final.status === 200, show(final))
  } else {
    console.log('\nDemo mode is off.\n')
    expectError('GET /api/demo is 404 outside demo mode', demo, 404, 'NOT_FOUND')
    const admin = new Browser()
    await admin.signIn(...DEMO.admin)
    expectError('POST /api/demo/reset is 404 outside demo mode', await admin.post('/api/demo/reset', {}), 404, 'NOT_FOUND')
    expectError('admin without two-factor login is 403 TWO_FACTOR_REQUIRED', await admin.get('/api/admin/daily'), 403, 'TWO_FACTOR_REQUIRED')
    const doctor = new Browser()
    await doctor.signIn(...DEMO.doctor)
    expectError('clinician without two-factor login is 403 TWO_FACTOR_REQUIRED', await doctor.get('/api/clinician/agenda'), 403, 'TWO_FACTOR_REQUIRED')
    const patient = new Browser()
    await patient.signIn(...DEMO.patient)
    const slot = await freeSlot(patient, { doctorId: 11 })
    const hold = await patient.post('/api/bookings', { slotId: slot.id, serviceId: 1, channel: 'video', for: 'self', inMainlandPortugal: true })
    const id = hold.json?.appointment?.id
    const consent = await patient.get('/api/consent/current')
    await patient.post(`/api/bookings/${id}/consent`, { version: consent.json.version })
    expectError('payment outside demo mode is 501 PAYMENT_UNAVAILABLE', await patient.post(`/api/bookings/${id}/pay`, { method: 'demo' }), 501, 'PAYMENT_UNAVAILABLE')
    await patient.del(`/api/bookings/${id}`)
    await originChecks(patient, true)
    const outbox = await anon.get('/api/dev/outbox')
    record(`dev outbox: ${outbox.status === 404 ? 'hidden' : 'shown'} (shown only with NODE_ENV=development)`, [200, 404].includes(outbox.status), String(outbox.status))
    await rateLimitCheck()
  }
} catch (error) {
  record('smoke script', false, error instanceof Error ? error.stack : String(error))
}

fakeDaily.close()
await prisma.$disconnect()
const failed = results.filter((item) => !item.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)

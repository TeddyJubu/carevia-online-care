const base = process.env.API_URL || 'http://127.0.0.1:4000'
const fakeKey = 'smoke-not-a-real-daily-key'
const results = []

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function request(path, { method = 'GET', body, cookie } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers.cookie = cookie
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  const setCookie = response.headers.get('set-cookie') || ''
  const session = setCookie.match(/carevia_session=([^;]+)/)?.[1] || ''
  return { status: response.status, json, text, cookie: session ? `carevia_session=${session}` : '' }
}

let patientCookie = ''
let adminCookie = ''
let appointmentId = ''

try {
  const health = await request('/api/health')
  record('health', health.status === 200 && health.json?.ok === true, `status ${health.status}`)

  const doctors = await request('/api/doctors')
  record('doctor count 220', doctors.json?.count === 220, `count ${doctors.json?.count}`)

  const services = await request('/api/services')
  const serviceCount = services.json?.groups?.reduce((sum, group) => sum + group.services.length, 0)
  const mens = services.json?.groups?.[0]?.services?.[12]
  record('service count 55', serviceCount === 55, `count ${serviceCount}`)
  record(
    'Men’s health apostrophe U+2019',
    mens === 'Men\u2019s health' && mens?.codePointAt(3) === 0x2019,
    mens,
  )

  const doctor = await request('/api/doctors/0')
  const profile = doctor.json?.doctor
  record(
    'doctor 0 wireframe profile',
    profile?.name === 'Dr Emma Laurent'
      && profile?.initials === 'EL'
      && profile?.specialty === 'General practitioner'
      && profile?.fee === 45
      && profile?.availabilityIndex === 0
      && profile?.experience === '5 years'
      && profile?.cedula === 'DEMO-CEDULA-0'
      && profile?.languages === 'English \u00b7 French'
      && profile?.service === 'Adult urgent care'
      && profile?.approach === 'A clear, collaborative consultation with time for your questions.',
    profile?.name,
  )

  const slots = await request('/api/doctors/0/slots')
  record(
    'doctor 0 slots include schedule times',
    Array.isArray(slots.json?.slots)
      && slots.json.slots.length <= 9
      && slots.json.slots.every((slot) => ['09:00', '11:30', '15:00'].includes(slot.time)),
    `slots ${slots.json?.slots?.length}`,
  )

  const emma = await request('/api/doctors?q=Emma')
  record(
    'search q=Emma',
    emma.json?.count === 11 && emma.json.doctors.every((item) => item.name.includes('Emma')),
    `count ${emma.json?.count}`,
  )

  const filtered = await request('/api/doctors?specialty=General%20practitioner&maxFee=45')
  record(
    'filter specialty and maxFee',
    filtered.json?.count > 0
      && filtered.json.doctors.every((item) => item.specialty === 'General practitioner' && item.fee <= 45),
    `count ${filtered.json?.count}`,
  )

  const email = `smoke-${Date.now()}@example.com`
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: {
      firstName: 'Smoke',
      lastName: 'Tester',
      email,
      phone: '+351 000 000 000',
      dateOfBirth: '1992-04-03',
      password: 'smoke-password',
    },
  })
  record(
    'register',
    registered.status === 201 && registered.json?.user?.role === 'patient' && registered.json.user.email === email && !registered.text.includes('passwordHash'),
    `status ${registered.status}`,
  )
  const meAfterRegister = await request('/api/auth/me', { cookie: registered.cookie })
  record('me after register', meAfterRegister.status === 200 && meAfterRegister.json?.user?.email === email, `status ${meAfterRegister.status}`)
  const loggedOut = await request('/api/auth/logout', { method: 'POST', cookie: registered.cookie })
  const meAfterLogout = await request('/api/auth/me', { cookie: registered.cookie })
  record('logout', loggedOut.status === 200 && meAfterLogout.status === 401, `logout ${loggedOut.status}, me ${meAfterLogout.status}`)

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'patient@example.com', password: 'demo-password' },
  })
  patientCookie = login.cookie
  record(
    'patient login',
    login.status === 200 && login.json?.user?.role === 'patient' && login.json.user.firstName === 'Demo',
    `status ${login.status}`,
  )
  const me = await request('/api/auth/me', { cookie: patientCookie })
  record('me', me.status === 200 && me.json?.user?.email === 'patient@example.com', `status ${me.status}`)

  const noCookie = await request('/api/appointments', {
    method: 'POST',
    body: { doctorId: 0, service: 'Adult urgent care', slot: '30 October 2026 \u00b7 09:00', channel: 'video' },
  })
  record(
    'appointment without cookie is 401 AUTH_REQUIRED',
    noCookie.status === 401 && noCookie.json?.error === 'AUTH_REQUIRED' && noCookie.json?.message === 'Log in or register to book a consultation',
    `status ${noCookie.status} ${noCookie.json?.error}`,
  )

  const audio = await request('/api/appointments', {
    method: 'POST',
    cookie: patientCookie,
    body: { doctorId: 0, service: 'Adult urgent care', slot: '30 October 2026 \u00b7 09:00', channel: 'audio' },
  })
  record('audio is 400 AUDIO_DISABLED', audio.status === 400 && audio.json?.error === 'AUDIO_DISABLED', `status ${audio.status} ${audio.json?.error}`)

  const videoStatus = await request('/api/video/status')
  record('video status disabled', videoStatus.status === 200 && videoStatus.json?.enabled === false && !('apiKey' in (videoStatus.json || {})), JSON.stringify(videoStatus.json))

  const openSlots = await request('/api/doctors/0/slots')
  const freeSlot = openSlots.json?.slots?.[0]?.label
  record('doctor 0 still has an open slot', openSlots.status === 200 && Boolean(freeSlot), freeSlot || 'none')

  const booked = await request('/api/appointments', {
    method: 'POST',
    cookie: patientCookie,
    body: { doctorId: 0, service: 'Adult urgent care', slot: freeSlot, channel: 'video' },
  })
  appointmentId = booked.json?.appointment?.id
  record(
    'video appointment confirmed',
    booked.status === 201 && booked.json?.appointment?.status === 'confirmed' && booked.json.appointment.channel === 'video',
    `status ${booked.status} ${freeSlot}`,
  )

  const taken = await request('/api/appointments', {
    method: 'POST',
    cookie: patientCookie,
    body: { doctorId: 0, service: 'Adult urgent care', slot: freeSlot, channel: 'video' },
  })
  record(
    'second booking of the same slot is 409 SLOT_TAKEN',
    taken.status === 409 && taken.json?.error === 'SLOT_TAKEN',
    `status ${taken.status} ${taken.json?.error}`,
  )

  const blocked = await request(`/api/appointments/${appointmentId}/video-token`, { method: 'POST', cookie: patientCookie })
  record(
    'video-token 409 when no key',
    blocked.status === 409 && blocked.json?.error === 'VIDEO_DISABLED' && /admin must save a Daily API key/i.test(blocked.json?.message || ''),
    `status ${blocked.status} ${blocked.json?.error}`,
  )

  const adminLogin = await request('/api/admin/login', {
    method: 'POST',
    body: { email: 'admin@carevia.test', password: 'admin-demo-password' },
  })
  adminCookie = adminLogin.cookie
  record('admin login returns role', adminLogin.status === 200 && adminLogin.json?.user?.role === 'admin', `status ${adminLogin.status}`)

  const patientAdmin = await request('/api/admin/daily', { cookie: patientCookie })
  record('patient cannot read daily settings', patientAdmin.status === 403, `status ${patientAdmin.status}`)

  const saved = await request('/api/admin/daily', {
    method: 'PUT',
    cookie: adminCookie,
    body: { apiKey: fakeKey },
  })
  const enabled = await request('/api/video/status')
  const hidden = await request('/api/admin/daily', { cookie: adminCookie })
  record(
    'fake key enables video without echoing the key',
    saved.status === 200
      && saved.json?.enabled === true
      && saved.json?.hint === fakeKey.slice(-4)
      && !saved.text.includes(fakeKey)
      && enabled.json?.enabled === true
      && hidden.json?.hint === fakeKey.slice(-4)
      && !hidden.text.includes(fakeKey)
      && hidden.json?.apiKey == null,
    `hint ${hidden.json?.hint}`,
  )

  const dailyAttempt = await request(`/api/appointments/${appointmentId}/video-token`, { method: 'POST', cookie: patientCookie })
  const stillUp = await request('/api/health')
  record(
    'patient video-token returns 502 and the API stays up',
    dailyAttempt.status === 502
      && dailyAttempt.json?.error === 'DAILY_ERROR'
      && !dailyAttempt.text.includes(fakeKey)
      && stillUp.status === 200,
    `status ${dailyAttempt.status}, health ${stillUp.status}`,
  )

  const cleared = await request('/api/admin/daily', {
    method: 'PUT',
    cookie: adminCookie,
    body: { apiKey: '' },
  })
  const disabledAgain = await request('/api/video/status')
  const tokenAgain = await request(`/api/appointments/${appointmentId}/video-token`, { method: 'POST', cookie: patientCookie })
  record(
    'clear key disables video',
    cleared.json?.enabled === false
      && cleared.json?.hint === ''
      && disabledAgain.json?.enabled === false
      && tokenAgain.status === 409
      && tokenAgain.json?.error === 'VIDEO_DISABLED',
    `status ${disabledAgain.json?.enabled}`,
  )

  const patientsForbidden = await request('/api/admin/patients', { cookie: patientCookie })
  const patients = await request('/api/admin/patients?q=patient@example.com', { cookie: adminCookie })
  record(
    'admin can list patients without passwords',
    patientsForbidden.status === 403
      && patients.status === 200
      && patients.json?.patients?.some((item) => item.email === 'patient@example.com')
      && !patients.text.includes('passwordHash'),
    `status ${patients.status}`,
  )

  const adminSlots = await request('/api/admin/doctors/0/slots', { cookie: adminCookie })
  const slotTimes = adminSlots.json?.slots || []
  record(
    'admin schedule hides past times',
    adminSlots.status === 200
      && slotTimes.every((slot) => Date.parse(slot.startsAt) > Date.now()),
    `slots ${slotTimes.length}`,
  )

  const pastSlot = await request('/api/admin/doctors/0/slots', {
    method: 'POST',
    cookie: adminCookie,
    body: { date: '2020-01-15', time: '09:00' },
  })
  record(
    'past time cannot be added',
    pastSlot.status === 400 && pastSlot.json?.error === 'SLOT_PAST',
    `status ${pastSlot.status} ${pastSlot.json?.error}`,
  )

  const passedBooking = await request('/api/appointments', {
    method: 'POST',
    cookie: patientCookie,
    body: { doctorId: 0, service: 'Adult urgent care', slot: '30 October 2026 \u00b7 09:00', channel: 'video' },
  })
  record(
    'past slot cannot be booked',
    passedBooking.status === 400 && ['SLOT_PAST', 'UNKNOWN_SLOT'].includes(passedBooking.json?.error),
    `status ${passedBooking.status} ${passedBooking.json?.error}`,
  )

  const futureSlot = await request('/api/admin/doctors/0/slots', {
    method: 'POST',
    cookie: adminCookie,
    body: { date: '2027-06-15', time: '10:00' },
  })
  const visible = await request('/api/doctors/0/slots')
  const createdId = futureSlot.json?.slot?.id
  const removedSlot = createdId
    ? await request(`/api/admin/doctors/0/slots/${createdId}`, { method: 'DELETE', cookie: adminCookie })
    : { status: 0 }
  record(
    'future time is visible then removed',
    futureSlot.status === 201
      && visible.json?.slots?.some((slot) => slot.label === '15 June 2027 \u00b7 10:00')
      && removedSlot.status === 200,
    `create ${futureSlot.status}, delete ${removedSlot.status}`,
  )
} catch (error) {
  record('smoke script', false, error instanceof Error ? error.message : String(error))
}

const failed = results.filter((item) => !item.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)

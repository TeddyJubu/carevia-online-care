import { DEMO_MODE } from '../config.js'
import { prisma } from '../prisma.js'
import { requireRole } from '../auth.js'
import { addDays, lisbonToday, SLOT_MINUTES } from '../rules.js'
import { openSlot } from '../schedule.js'
import { sendError } from '../views.js'

// Draft for Carevia's lawyer. The version is what the doctor accepted.
export const AGREEMENT_VERSION = 'draft-2026-11-12'
export const AGREEMENT = [
  'A private space for every call. You consult from somewhere private and quiet, with usable light.',
  'Patients see who you are. Your professional name and cédula show on your profile and in the visit.',
  'The record lives in iMED. Notes, prescriptions, certificates and test requests are written in iMED only. Carevia keeps booking, payment and call state.',
  'Nothing is recorded. Calls are never recorded in Carevia.',
  'Poor quality ends the visit. If sound or picture is too poor for a safe opinion, end it, record the Carevia outcome, and write the reason in iMED.',
  'Not an emergency service. Patients are told to call 112 in an emergency. You see patients who are in mainland Portugal.',
]

export function onboardingSteps(row, user) {
  const security = Boolean(user.emailVerified) && (Boolean(user.twoFactorEnabled) || Boolean(row.twoFactorSkippedAt))
  const profile = Boolean(row.profileCheckedAt) && !row.profileFlaggedAt
  const agreement = Boolean(row.agreementAcceptedAt)
  const hours = Boolean(row.hoursOpenedAt) && Boolean(row.deviceCheckedAt)
  const flags = [
    { key: 'password', title: 'Set your password', done: true, detail: 'Done.' },
    {
      key: 'security',
      title: 'Secure your account',
      done: security,
      detail: row.twoFactorSkippedAt
        ? 'Email verified. Two-factor skipped for this demo.'
        : 'Verify your email and turn on two-factor login.',
    },
    { key: 'profile', title: 'Check your public profile', done: profile, detail: 'See exactly what patients see.' },
    { key: 'agreement', title: 'How Carevia work works', done: agreement, detail: 'Six short statements to read and accept.' },
    { key: 'hours', title: 'Open your hours and test your camera', done: hours, detail: 'Then your profile goes live.' },
  ]
  const next = flags.find((step) => !step.done)
  return {
    required: true,
    complete: !next,
    demo: DEMO_MODE,
    steps: flags.map((step) => ({ ...step, state: step.done ? 'done' : step.key === next?.key ? 'current' : 'later' })),
  }
}

async function ensureOnboarding(userId) {
  const existing = await prisma.clinicianOnboarding.findUnique({ where: { userId } })
  if (existing) return existing
  const invite = await prisma.clinicianInvite.findFirst({
    where: { acceptedAt: { not: null }, doctor: { clinicianUserId: userId } },
  })
  if (!invite) return null
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } })
  return prisma.clinicianOnboarding.create({ data: { userId } })
}

export async function onboardingBlock(userId) {
  const row = await ensureOnboarding(userId)
  if (!row) return null
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const view = onboardingSteps(row, user)
  return view.complete ? null : view
}

async function loadContext(request, reply) {
  const user = await requireRole(request, reply, ['clinician'])
  if (!user) return null
  const doctor = await prisma.doctor.findUnique({ where: { clinicianUserId: user.id }, include: { group: true } })
  if (!doctor) {
    sendError(reply, 403, 'NO_DOCTOR_PROFILE', 'This login is not linked to a doctor profile.')
    return null
  }
  const row = await ensureOnboarding(user.id)
  const fresh = await prisma.user.findUnique({ where: { id: user.id } })
  return { user: fresh, doctor, row }
}

export async function onboardingRoutes(app) {
  app.get('/api/clinician/onboarding', async (request, reply) => {
    const ctx = await loadContext(request, reply)
    if (!ctx) return
    if (!ctx.row) return { required: false, complete: true, steps: [] }
    const steps = onboardingSteps(ctx.row, ctx.user)
    return {
      ...steps,
      profile: {
        name: ctx.doctor.name,
        specialty: ctx.doctor.specialty,
        cedula: ctx.doctor.cedula,
        fee: ctx.doctor.fee,
        languages: ctx.doctor.languages,
        experience: ctx.doctor.experience,
        education: ctx.doctor.education,
        shown: ctx.doctor.active,
        flagged: Boolean(ctx.row.profileFlaggedAt),
      },
      agreement: { version: AGREEMENT_VERSION, statements: AGREEMENT, draft: true },
    }
  })

  app.post('/api/clinician/onboarding/skip-two-factor', async (request, reply) => {
    if (!DEMO_MODE) return sendError(reply, 404, 'NOT_FOUND', 'Not found.')
    const ctx = await loadContext(request, reply)
    if (!ctx?.row) return
    await prisma.clinicianOnboarding.update({ where: { userId: ctx.user.id }, data: { twoFactorSkippedAt: new Date() } })
    return { ok: true }
  })

  app.post('/api/clinician/onboarding/profile', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['languages', 'experience', 'education', 'decision'],
        properties: {
          languages: { type: 'string', minLength: 1, maxLength: 200 },
          experience: { type: 'string', minLength: 1, maxLength: 200 },
          education: { type: 'string', minLength: 1, maxLength: 2000 },
          decision: { type: 'string', enum: ['confirm', 'flag'] },
          message: { type: 'string', maxLength: 500 },
        },
      },
    },
  }, async (request, reply) => {
    const ctx = await loadContext(request, reply)
    if (!ctx?.row) return
    const { languages, experience, education, decision, message } = request.body
    if (decision === 'flag' && !String(message || '').trim()) {
      return sendError(reply, 400, 'VALIDATION', 'Tell the team what looks wrong. Nothing clinical: this note stays in Carevia.')
    }
    await prisma.doctor.update({
      where: { id: ctx.doctor.id },
      data: { languages: languages.trim(), experience: experience.trim(), education: education.trim() },
    })
    await prisma.clinicianOnboarding.update({
      where: { userId: ctx.user.id },
      data: decision === 'confirm'
        ? { profileCheckedAt: new Date(), profileFlaggedAt: null, profileFlag: '' }
        : { profileCheckedAt: null, profileFlaggedAt: new Date(), profileFlag: String(message).trim() },
    })
    return { ok: true }
  })

  app.post('/api/clinician/onboarding/agreement', {
    schema: {
      body: { type: 'object', additionalProperties: false, required: ['version'], properties: { version: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const ctx = await loadContext(request, reply)
    if (!ctx?.row) return
    if (request.body.version !== AGREEMENT_VERSION) return sendError(reply, 409, 'STALE_AGREEMENT', 'These statements have changed. Read them again.')
    await prisma.clinicianOnboarding.update({
      where: { userId: ctx.user.id },
      data: { agreementVersion: AGREEMENT_VERSION, agreementAcceptedAt: new Date() },
    })
    return { ok: true }
  })

  app.post('/api/clinician/onboarding/hours', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'days'],
        properties: {
          from: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
          to: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
          days: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'integer', minimum: 0, maximum: 6 } },
        },
      },
    },
  }, async (request, reply) => {
    const ctx = await loadContext(request, reply)
    if (!ctx?.row) return
    const { from, to, days } = request.body
    if (to <= from) return sendError(reply, 400, 'VALIDATION', 'The end of the day needs to be after the start.')
    const wanted = new Set(days)
    const today = lisbonToday()
    let opened = 0
    for (let offset = 0; offset < 21; offset += 1) {
      const date = addDays(today, offset)
      const [year, month, day] = date.split('-').map(Number)
      if (!wanted.has(new Date(Date.UTC(year, month - 1, day)).getUTCDay())) continue
      for (const time of timesBetween(from, to)) {
        const result = await openSlot(ctx.doctor.id, date, time)
        if (result.slot) opened += 1
      }
    }
    const future = await prisma.slot.count({ where: { doctorId: ctx.doctor.id, closedAt: null, startsAt: { gt: new Date() } } })
    if (!future) return sendError(reply, 400, 'NO_OPEN_TIME', 'At least one future open time is needed to finish.')
    await prisma.clinicianOnboarding.update({ where: { userId: ctx.user.id }, data: { hoursOpenedAt: new Date() } })
    return { opened, future }
  })

  app.post('/api/clinician/onboarding/device', async (request, reply) => {
    const ctx = await loadContext(request, reply)
    if (!ctx?.row) return
    if (!ctx.row.hoursOpenedAt) return sendError(reply, 409, 'HOURS_FIRST', 'Open at least one time before the camera check.')
    await prisma.clinicianOnboarding.update({ where: { userId: ctx.user.id }, data: { deviceCheckedAt: new Date() } })
    return { ok: true }
  })

  app.post('/api/clinician/onboarding/live', async (request, reply) => {
    const ctx = await loadContext(request, reply)
    if (!ctx?.row) return
    if (!ctx.row.hoursOpenedAt || !ctx.row.deviceCheckedAt) {
      return sendError(reply, 409, 'SETUP_INCOMPLETE', 'Open your hours and test the camera before patients can book you.')
    }
    await prisma.doctor.update({ where: { id: ctx.doctor.id }, data: { active: true } })
    await prisma.clinicianOnboarding.update({ where: { userId: ctx.user.id }, data: { wentLiveAt: new Date() } })
    return { ok: true }
  })
}

function timesBetween(from, to) {
  const toMin = (value) => {
    const [h, m] = value.split(':').map(Number)
    return h * 60 + m
  }
  const start = toMin(from)
  const end = toMin(to)
  const times = []
  for (let minute = start; minute + SLOT_MINUTES <= end; minute += SLOT_MINUTES) {
    const h = String(Math.floor(minute / 60)).padStart(2, '0')
    const m = String(minute % 60).padStart(2, '0')
    times.push(`${h}:${m}`)
  }
  return times
}

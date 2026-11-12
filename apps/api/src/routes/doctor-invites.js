import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { isPasswordCompromised } from 'better-auth/plugins/haveibeenpwned'
import { PUBLIC_APP_URL } from '../auth.js'
import { sendMail } from '../mail.js'
import { prisma } from '../prisma.js'
import { requireRole } from '../auth.js'
import { makeLimiter } from './doctor-applications.js'
import { sendError } from '../views.js'

const INVITE_MS = 7 * 24 * 60 * 60 * 1000
const doctorParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[0-9]+$' } } }

export function newInviteToken() {
  return randomBytes(32).toString('base64url')
}

export function hashInviteToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

export function loginState(doctor) {
  if (!doctor) return { profile: null, account: null, invite: null }
  const account = doctor.clinician
  const invite = doctor.invite
  return {
    profile: { id: doctor.id, name: doctor.name, shown: doctor.active },
    account: account ? {
      email: account.email,
      emailVerified: Boolean(account.emailVerified),
      twoFactor: Boolean(account.twoFactorEnabled),
    } : null,
    invite: invite ? {
      email: invite.email,
      sentAt: invite.sentAt,
      acceptedAt: invite.acceptedAt,
      revokedAt: invite.revokedAt,
      expiresAt: invite.expiresAt,
    } : null,
  }
}

function initials(first, last) {
  const letter = (value) => [...value.normalize('NFD').replace(/\p{M}/gu, '')].find((ch) => /\p{L}/u.test(ch)) || ''
  return `${letter(first)}${letter(last)}`.toUpperCase()
}

async function issueInvite({ doctorId, email }) {
  const token = newInviteToken()
  const expiresAt = new Date(Date.now() + INVITE_MS)
  await prisma.clinicianInvite.upsert({
    where: { doctorId },
    update: { email, tokenHash: hashInviteToken(token), expiresAt, sentAt: new Date(), acceptedAt: null, revokedAt: null },
    create: { doctorId, email, tokenHash: hashInviteToken(token), expiresAt },
  })
  const link = `${PUBLIC_APP_URL}/app/reset-password?invite=${encodeURIComponent(token)}`
  // The raw token lives only in this email. Logs keep the template name (src/mail.js, src/app.js).
  await sendMail({
    template: 'clinician-invite',
    to: email,
    subject: 'Set up your Carevia login',
    text: `This link sets the password for your Carevia agenda. It works once and expires in 7 days.\n\n${link}\n\nCarevia never asks for your iMED password. If you did not expect this, you can ignore this email.`,
    links: [link],
  })
}

async function ensureClinician({ email, firstName, lastName, phone }) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    const error = new Error('This email already has a Carevia account. A patient account cannot become a clinician account here.')
    error.status = 409
    error.code = 'ACCOUNT_EXISTS'
    throw error
  }
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone,
      dateOfBirth: '',
      role: 'clinician',
      emailVerified: false,
    },
  })
  // Unknown until the doctor opens the invite. They cannot guess it, and the invite replaces it.
  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: await hashPassword(randomUUID()),
    },
  })
  return user
}

export async function doctorInviteRoutes(app) {
  const previewLimit = makeLimiter({ max: 20, windowMs: 60 * 60_000 })
  const acceptLimit = makeLimiter({ max: 10, windowMs: 60 * 60_000 })

  app.post('/api/admin/doctor-applications/:id/invite', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['fee'],
        properties: {
          fee: { type: 'integer', minimum: 1, maximum: 500 },
          groupSlug: { type: 'string', maxLength: 40 },
        },
      },
    },
  }, async (request, reply) => {
    if (!(await requireRole(request, reply, ['admin']))) return
    try {
      const doctorId = await inviteFromApplication(request.params.id, request.body)
      const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { clinician: true, invite: true } })
      return reply.code(201).send({ login: loginState(doctor) })
    } catch (error) {
      if (error.status) return sendError(reply, error.status, error.code, error.message)
      throw error
    }
  })

  app.post('/api/admin/doctors/:id/invite', {
    schema: {
      params: doctorParams,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['email'],
        properties: { email: { type: 'string', maxLength: 200, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' } },
      },
    },
  }, async (request, reply) => {
    if (!(await requireRole(request, reply, ['admin']))) return
    try {
      await inviteExistingDoctor(Number(request.params.id), request.body.email.toLowerCase())
      const doctor = await prisma.doctor.findUnique({ where: { id: Number(request.params.id) }, include: { clinician: true, invite: true } })
      return reply.code(201).send({ login: loginState(doctor) })
    } catch (error) {
      if (error.status) return sendError(reply, error.status, error.code, error.message)
      throw error
    }
  })

  app.post('/api/admin/doctors/:id/invite/resend', { schema: { params: doctorParams } }, async (request, reply) => {
    if (!(await requireRole(request, reply, ['admin']))) return
    const doctor = await prisma.doctor.findUnique({ where: { id: Number(request.params.id) }, include: { invite: true, clinician: true } })
    if (!doctor?.invite || !doctor.clinician) return sendError(reply, 404, 'NOT_FOUND', 'This doctor has no invite to resend.')
    if (doctor.invite.acceptedAt) return sendError(reply, 409, 'ALREADY_ACCEPTED', 'This doctor has already set a password.')
    await issueInvite({ doctorId: doctor.id, email: doctor.invite.email })
    const fresh = await prisma.doctor.findUnique({ where: { id: doctor.id }, include: { clinician: true, invite: true } })
    return { login: loginState(fresh) }
  })

  app.post('/api/admin/doctors/:id/invite/revoke', { schema: { params: doctorParams } }, async (request, reply) => {
    if (!(await requireRole(request, reply, ['admin']))) return
    const doctor = await prisma.doctor.findUnique({ where: { id: Number(request.params.id) }, include: { invite: true, clinician: true } })
    if (!doctor?.invite) return sendError(reply, 404, 'NOT_FOUND', 'This doctor has no invite to revoke.')
    if (doctor.invite.acceptedAt) return sendError(reply, 409, 'ALREADY_ACCEPTED', 'This doctor has already set a password. Closing the login is a separate step.')
    await prisma.$transaction([
      prisma.clinicianInvite.update({ where: { doctorId: doctor.id }, data: { revokedAt: new Date(), tokenHash: null, expiresAt: null } }),
      prisma.doctor.update({ where: { id: doctor.id }, data: { clinicianUserId: null } }),
      prisma.session.deleteMany({ where: { userId: doctor.clinicianUserId || '' } }),
      prisma.account.deleteMany({ where: { userId: doctor.clinicianUserId || '' } }),
      prisma.user.deleteMany({ where: { id: doctor.clinicianUserId || '' } }),
    ])
    const fresh = await prisma.doctor.findUnique({ where: { id: doctor.id }, include: { clinician: true, invite: true } })
    return { login: loginState(fresh) }
  })

  app.get('/api/admin/doctors/:id/login', { schema: { params: doctorParams } }, async (request, reply) => {
    if (!(await requireRole(request, reply, ['admin']))) return
    const doctor = await prisma.doctor.findUnique({ where: { id: Number(request.params.id) }, include: { clinician: true, invite: true } })
    if (!doctor) return sendError(reply, 404, 'NOT_FOUND', 'Doctor not found.')
    return { login: loginState(doctor) }
  })

  app.post('/api/doctor-invites/preview', {
    schema: {
      body: { type: 'object', additionalProperties: false, required: ['token'], properties: { token: { type: 'string', minLength: 20, maxLength: 200 } } },
    },
  }, async (request, reply) => {
    if (!previewLimit(request.ip)) return sendError(reply, 429, 'TOO_MANY_REQUESTS', 'Too many attempts. Try again in an hour.')
    const invite = await openInvite(request.body.token)
    if (!invite) return sendError(reply, 400, 'INVITE_INVALID', 'Link expired, or already used? Ask the Carevia team to send a new invite.')
    return { email: invite.email }
  })

  app.post('/api/doctor-invites/accept', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['token', 'password'],
        properties: {
          token: { type: 'string', minLength: 20, maxLength: 200 },
          password: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    if (!acceptLimit(request.ip)) return sendError(reply, 429, 'TOO_MANY_REQUESTS', 'Too many attempts. Try again in an hour.')
    const invite = await openInvite(request.body.token)
    if (!invite) return sendError(reply, 400, 'INVITE_INVALID', 'Link expired, or already used? Ask the Carevia team to send a new invite.')
    try {
      if (await isPasswordCompromised(request.body.password)) {
        return sendError(reply, 400, 'PASSWORD_COMPROMISED', 'This password has appeared in a data breach. Choose a different one.')
      }
    } catch {
      return sendError(reply, 503, 'PASSWORD_CHECK_UNAVAILABLE', 'We couldn’t check that password just now. Try again in a moment.')
    }
    const doctor = await prisma.doctor.findUnique({ where: { id: invite.doctorId } })
    if (!doctor?.clinicianUserId) return sendError(reply, 400, 'INVITE_INVALID', 'Link expired, or already used? Ask the Carevia team to send a new invite.')
    await prisma.account.updateMany({
      where: { userId: doctor.clinicianUserId, providerId: 'credential' },
      data: { password: await hashPassword(request.body.password) },
    })
    await prisma.clinicianInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), tokenHash: null, expiresAt: null },
    })
    return { email: invite.email }
  })
}

async function openInvite(token) {
  const invite = await prisma.clinicianInvite.findFirst({ where: { tokenHash: hashInviteToken(token) } })
  if (!invite || invite.revokedAt || invite.acceptedAt) return null
  if (!invite.expiresAt || invite.expiresAt.getTime() <= Date.now()) return null
  return invite
}

async function inviteFromApplication(id, body) {
  const application = await prisma.doctorApplication.findUnique({ where: { id } })
  if (!application) fail(404, 'NOT_FOUND', 'Application not found.')
  if (application.status !== 'approved') fail(409, 'NOT_APPROVED', 'Approve the application before sending an invite. Approving creates nothing by itself.')
  if (application.doctorId) fail(409, 'ALREADY_INVITED', 'This application already has a doctor profile.')
  const slug = body.groupSlug || application.groupSlug
  if (!slug) fail(400, 'VALIDATION', 'Choose the area of care before sending the invite.')
  const group = await prisma.serviceGroup.findUnique({
    where: { slug },
    include: { services: { where: { active: true }, orderBy: { sortOrder: 'asc' }, take: 1 } },
  })
  const service = group?.services[0]
  if (!service) fail(400, 'VALIDATION', 'That area of care has no service to attach this profile to.')
  const email = application.email.toLowerCase()
  const user = await ensureClinician({ email, firstName: application.firstName, lastName: application.lastName, phone: application.phone })
  const max = await prisma.doctor.aggregate({ _max: { id: true } })
  const doctor = await prisma.doctor.create({
    data: {
      id: (max._max.id ?? 0) + 1,
      name: `Dr ${application.firstName} ${application.lastName}`,
      initials: initials(application.firstName, application.lastName),
      specialty: application.specialty,
      languages: application.languages,
      fee: body.fee,
      availabilityIndex: 0,
      experience: `${application.yearsInPractice} years`,
      education: 'Illustrative text, from the application.',
      approach: 'Video consultations on the hours this doctor opens. The clinical record stays in iMED.',
      cedula: application.cedula,
      active: false,
      groupId: group.id,
      serviceId: service.id,
      clinicianUserId: user.id,
    },
  })
  await prisma.doctorApplication.update({ where: { id: application.id }, data: { doctorId: doctor.id } })
  await issueInvite({ doctorId: doctor.id, email })
  return doctor.id
}

async function inviteExistingDoctor(id, email) {
  const doctor = await prisma.doctor.findUnique({ where: { id }, include: { clinician: true } })
  if (!doctor) fail(404, 'NOT_FOUND', 'Doctor not found.')
  if (doctor.clinicianUserId) fail(409, 'ALREADY_LINKED', 'This doctor already has a login. One login per doctor.')
  const parts = doctor.name.replace(/^Dr\s+/i, '').split(/\s+/)
  const firstName = parts[0] || 'Doctor'
  const lastName = parts.slice(1).join(' ') || 'Carevia'
  const user = await ensureClinician({ email, firstName, lastName, phone: '' })
  await prisma.doctor.update({ where: { id: doctor.id }, data: { clinicianUserId: user.id } })
  await issueInvite({ doctorId: doctor.id, email })
}

function fail(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  throw error
}

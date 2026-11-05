import bcrypt from 'bcryptjs'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import { registerAdminCatalog } from './admin-catalog.js'
import { isUpcoming, languageTokens } from './catalog.js'
import { createMeetingToken, createPrivateRoom, dailyHint, tokenWindow } from './daily.js'
import { prisma } from './prisma.js'
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  requireAdmin,
  sessionCookieOptions,
  toPublicUser,
  userFromRequest,
} from './session.js'

const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:5174']

function single(value) {
  if (Array.isArray(value)) return value[0] == null ? '' : String(value[0])
  if (value == null) return ''
  return String(value)
}

function toDoctor(doctor) {
  return {
    id: doctor.id,
    name: doctor.name,
    initials: doctor.initials,
    specialty: doctor.specialty,
    languages: doctor.languages,
    fee: doctor.fee,
    availabilityIndex: doctor.availabilityIndex,
    experience: doctor.experience,
    education: doctor.education,
    approach: doctor.approach,
    cedula: doctor.cedula,
    group: doctor.groupId,
    groupName: doctor.group.name,
    service: doctor.service.name,
    services: [doctor.service.name],
  }
}

function parseDateOfBirth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null
  if (date.getTime() > Date.now()) return null
  return date
}

async function startSession(reply, user) {
  const token = await createSession(user.id)
  reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions())
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.apiKey'],
    },
  })

  await app.register(fastifyCors, {
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
  await app.register(fastifyCookie)

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Check the submitted fields.' })
    }
    request.log.error({ err: error }, 'request failed')
    return reply.code(500).send({ error: 'INTERNAL', message: 'Something went wrong.' })
  })

  app.get('/api/health', async () => ({ ok: true }))

  app.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'password'],
        properties: {
          firstName: { type: 'string', minLength: 1, maxLength: 80 },
          lastName: { type: 'string', minLength: 1, maxLength: 80 },
          email: { type: 'string', minLength: 3, maxLength: 200 },
          phone: { type: 'string', minLength: 1, maxLength: 40 },
          dateOfBirth: { type: 'string', minLength: 10, maxLength: 10 },
          password: { type: 'string', minLength: 8, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const firstName = request.body.firstName.trim()
    const lastName = request.body.lastName.trim()
    const email = request.body.email.trim().toLowerCase()
    const phone = request.body.phone.trim()
    const dateOfBirth = parseDateOfBirth(request.body.dateOfBirth)
    if (!firstName || !lastName || !phone) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Enter your name and phone number.' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Enter a valid email address.' })
    }
    if (!dateOfBirth) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Enter a valid date of birth.' })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return reply.code(409).send({ error: 'EMAIL_IN_USE', message: 'An account with that email already exists.' })
    }

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        passwordHash: await bcrypt.hash(request.body.password, 10),
        role: 'patient',
      },
    })
    await startSession(reply, user)
    return reply.code(201).send({ user: toPublicUser(user) })
  })

  async function login(request, reply, { requireAdmin = false } = {}) {
    const email = String(request.body.email || '').trim().toLowerCase()
    const password = String(request.body.password || '')
    const user = await prisma.user.findUnique({ where: { email } })
    const matches = user ? await bcrypt.compare(password, user.passwordHash) : false
    if (!user || !matches) {
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS', message: 'The email or password is not correct.' })
    }
    if (requireAdmin && user.role !== 'admin') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin access only.' })
    }
    await startSession(reply, user)
    return { user: toPublicUser(user) }
  }

  const loginSchema = {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', minLength: 3 },
        password: { type: 'string', minLength: 1 },
      },
    },
  }

  app.post('/api/auth/login', { schema: loginSchema }, (request, reply) => login(request, reply))
  app.post('/api/admin/login', { schema: loginSchema }, (request, reply) => login(request, reply, { requireAdmin: true }))

  app.post('/api/auth/logout', async (request, reply) => {
    await destroySession(request)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/auth/me', async (request, reply) => {
    const user = await userFromRequest(request)
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHENTICATED', message: 'Log in to continue.' })
    }
    return { user: toPublicUser(user) }
  })

  app.get('/api/services', async () => {
    const groups = await prisma.serviceGroup.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      include: { services: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
    })
    return {
      groups: groups
        .filter((group) => group.services.length > 0)
        .map((group) => ({
          id: group.id,
          name: group.name,
          blurb: group.blurb,
          icon: group.icon,
          services: group.services.map((service) => service.name),
        })),
    }
  })

  app.get('/api/doctors', async (request, reply) => {
    const q = single(request.query.q).trim()
    const specialty = single(request.query.specialty).trim()
    const maxFee = single(request.query.maxFee).trim()
    const availability = single(request.query.availability).trim()
    const service = single(request.query.service).trim().replaceAll("'", '\u2019')
    const group = single(request.query.group).trim()
    const language = single(request.query.language).trim()

    const where = {
      active: true,
      group: { active: true },
      service: { active: true },
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { specialty: { contains: q, mode: 'insensitive' } },
        { languages: { contains: q, mode: 'insensitive' } },
        { service: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }
    if (specialty) where.specialty = specialty
    if (maxFee !== '') {
      const fee = Number(maxFee)
      if (!Number.isFinite(fee) || fee < 0) {
        return reply.code(400).send({ error: 'INVALID_FILTER', message: 'maxFee must be a number of euros.' })
      }
      where.fee = { lte: fee }
    }
    if (availability !== '' && availability !== 'any') {
      const index = Number(availability)
      if (!Number.isInteger(index) || index < 0 || index > 2) {
        return reply.code(400).send({ error: 'INVALID_FILTER', message: 'availability must be any, 0, 1, or 2.' })
      }
      where.availabilityIndex = { lte: index }
    }
    if (service) where.service = { ...where.service, name: service }
    if (group !== '' && group !== 'any') {
      const groupId = Number(group)
      if (!Number.isInteger(groupId)) {
        return reply.code(400).send({ error: 'INVALID_FILTER', message: 'group must be a group id.' })
      }
      where.groupId = groupId
    }

    const rows = await prisma.doctor.findMany({
      where,
      include: { group: true, service: true },
      orderBy: { id: 'asc' },
    })
    const doctors = (language
      ? rows.filter((doctor) => languageTokens(doctor.languages).includes(language))
      : rows
    ).map(toDoctor)
    return { doctors, count: doctors.length }
  })

  app.get('/api/doctors/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id)) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Doctor id must be a number.' })
    }
    const doctor = await prisma.doctor.findUnique({
      where: { id },
      include: { group: true, service: true },
    })
    if (!doctor || !doctor.active || !doctor.group.active || !doctor.service.active) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Doctor not found.' })
    }
    return { doctor: toDoctor(doctor) }
  })

  app.get('/api/doctors/:id/slots', async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id)) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Doctor id must be a number.' })
    }
    const now = new Date()
    const doctor = await prisma.doctor.findUnique({
      where: { id },
      include: { group: true, service: true },
    })
    if (!doctor || !doctor.active || !doctor.group.active || !doctor.service.active) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Doctor not found.' })
    }
    const [slots, booked] = await Promise.all([
      prisma.slot.findMany({
        where: { doctorId: id, startsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
      }),
      prisma.appointment.findMany({
        where: { doctorId: id, status: 'confirmed' },
        select: { slot: true },
      }),
    ])
    const taken = new Set(booked.map((row) => row.slot))
    return {
      doctorId: id,
      slots: slots
        .filter((slot) => isUpcoming(slot.startsAt, now) && !taken.has(slot.label))
        .map((slot) => ({ label: slot.label, day: slot.day, time: slot.time })),
    }
  })

  app.post('/api/appointments', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['doctorId', 'service', 'slot', 'channel'],
        properties: {
          doctorId: { type: 'integer' },
          service: { type: 'string', minLength: 1 },
          slot: { type: 'string', minLength: 1 },
          channel: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const user = await userFromRequest(request)
    if (!user) {
      return reply.code(401).send({
        error: 'AUTH_REQUIRED',
        message: 'Log in or register to book a consultation',
      })
    }
    if (request.body.channel === 'audio') {
      return reply.code(400).send({
        error: 'AUDIO_DISABLED',
        message: 'Audio consultations are not available yet.',
      })
    }
    if (request.body.channel !== 'video') {
      return reply.code(400).send({ error: 'INVALID_CHANNEL', message: 'Choose a video consultation.' })
    }

    const doctor = await prisma.doctor.findUnique({
      where: { id: request.body.doctorId },
      include: { service: true, group: true },
    })
    if (!doctor || !doctor.active || !doctor.group.active || !doctor.service.active) {
      return reply.code(404).send({ error: 'DOCTOR_NOT_FOUND', message: 'That doctor is not available.' })
    }
    if (doctor.service.name !== request.body.service) {
      return reply.code(400).send({ error: 'SERVICE_MISMATCH', message: 'That service is not offered by this doctor.' })
    }
    const slot = await prisma.slot.findUnique({
      where: { doctorId_label: { doctorId: doctor.id, label: request.body.slot } },
    })
    if (!slot || !isUpcoming(slot.startsAt)) {
      return reply.code(400).send({
        error: slot ? 'SLOT_PAST' : 'UNKNOWN_SLOT',
        message: slot ? 'That time has already passed. Choose a later time.' : 'Choose an available time.',
      })
    }

    const already = await prisma.appointment.findUnique({
      where: { doctorId_slot: { doctorId: doctor.id, slot: request.body.slot } },
    })
    if (already) {
      return reply.code(409).send({
        error: 'SLOT_TAKEN',
        message: 'That time was just booked. Choose another time.',
      })
    }

    let appointment
    try {
      appointment = await prisma.appointment.create({
        data: {
          patientId: user.id,
          doctorId: doctor.id,
          service: request.body.service,
          slot: request.body.slot,
          channel: 'video',
          status: 'confirmed',
          fee: doctor.fee,
        },
      })
    } catch (error) {
      if (error?.code === 'P2002') {
        return reply.code(409).send({
          error: 'SLOT_TAKEN',
          message: 'That time was just booked. Choose another time.',
        })
      }
      throw error
    }
    return reply.code(201).send({
      appointment: {
        id: appointment.id,
        doctorId: appointment.doctorId,
        doctorName: doctor.name,
        service: appointment.service,
        slot: appointment.slot,
        channel: appointment.channel,
        status: appointment.status,
        fee: appointment.fee,
      },
    })
  })

  app.get('/api/video/status', async () => {
    const settings = await prisma.dailySettings.findUnique({ where: { id: 1 } })
    return { enabled: Boolean(settings?.apiKey) }
  })

  app.post('/api/appointments/:id/video-token', async (request, reply) => {
    const user = await userFromRequest(request)
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHENTICATED', message: 'Log in to continue.' })
    }
    const appointment = await prisma.appointment.findUnique({ where: { id: request.params.id } })
    if (!appointment) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Appointment not found.' })
    }
    if (appointment.patientId !== user.id && user.role !== 'admin') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'You cannot join this consultation.' })
    }
    if (appointment.channel !== 'video') {
      return reply.code(400).send({ error: 'AUDIO_DISABLED', message: 'Audio consultations are not available yet.' })
    }

    const settings = await prisma.dailySettings.findUnique({ where: { id: 1 } })
    const apiKey = settings?.apiKey ?? ''
    if (!apiKey) {
      return reply.code(409).send({
        error: 'VIDEO_DISABLED',
        message: 'An admin must save a Daily API key before video consultations can start.',
      })
    }

    try {
      let roomName = appointment.dailyRoomName
      let roomUrl = appointment.dailyRoomUrl
      if (!roomName) {
        const room = await createPrivateRoom(apiKey)
        roomName = room?.name
        roomUrl = room?.url
        if (!roomName || !roomUrl) {
          throw new Error('Daily room response was incomplete')
        }
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { dailyRoomName: roomName, dailyRoomUrl: roomUrl },
        })
      }
      const window = tokenWindow(appointment.slot)
      const issued = await createMeetingToken(apiKey, {
        roomName,
        isOwner: user.role === 'admin',
        nbf: window.nbf,
        exp: window.exp,
      })
      if (!issued?.token) throw new Error('Daily token response was incomplete')
      return { token: issued.token, url: roomUrl, roomName }
    } catch (error) {
      request.log.error({ status: error.status, appointmentId: appointment.id }, 'Daily video token failed')
      return reply.code(502).send({
        error: 'DAILY_ERROR',
        message: 'The video service could not start this consultation.',
      })
    }
  })

  registerAdminCatalog(app)

  app.get('/api/admin/daily', async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const settings = await prisma.dailySettings.findUnique({ where: { id: 1 } })
    return dailyHint(settings?.apiKey ?? '')
  })

  app.put('/api/admin/daily', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['apiKey'],
        properties: {
          apiKey: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const apiKey = request.body.apiKey.trim()
    await prisma.dailySettings.upsert({
      where: { id: 1 },
      update: { apiKey },
      create: { id: 1, apiKey },
    })
    return dailyHint(apiKey)
  })

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })

  return app
}

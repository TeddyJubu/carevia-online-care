import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import { TRUSTED_ORIGINS, authRoutes } from './auth.js'
import { OUTBOX_ENABLED } from './config.js'
import { originProblem } from './origin.js'
import { adminCatalogRoutes } from './routes/admin-catalog.js'
import { prisma } from './prisma.js'
import { appointmentRoutes } from './routes/appointments.js'
import { bookingRoutes } from './routes/bookings.js'
import { doctorApplicationRoutes } from './routes/doctor-applications.js'
import { doctorInviteRoutes } from './routes/doctor-invites.js'
import { catalogRoutes } from './routes/catalog.js'
import { peopleRoutes } from './routes/people.js'
import { staffRoutes } from './routes/staff.js'
import { sendDueReminders } from './reminders.js'
import { sweepExpiredHolds, topUpSlots } from './schedule.js'

const SENSITIVE = [
  'password', 'newPassword', 'currentPassword', 'token', 'code', 'backupCode', 'apiKey', 'secret',
  'email', 'newEmail', 'phone', 'name', 'firstName', 'lastName', 'dateOfBirth',
]

// No names, emails, phones, birth dates, cookies or tokens in logs: requests are logged by path only
// (query strings and Better Auth path tokens removed), without headers or the client IP.
export function safePath(url) {
  return String(url || '').split('?')[0].replace(/^\/api\/auth\/reset-password\/.+$/, '/api/auth/reset-password/[redacted]')
}

function loggerOptions() {
  if (process.env.LOG_LEVEL === 'silent') return false
  return {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      req: (request) => ({ method: request.method, path: safePath(request.url) }),
      res: (reply) => ({ statusCode: reply.statusCode }),
    },
    redact: {
      censor: '[redacted]',
      paths: [
        'req.headers', 'res.headers', 'headers', 'cookie', 'cookies',
        ...SENSITIVE, ...SENSITIVE.map((key) => `*.${key}`), ...SENSITIVE.map((key) => `body.${key}`),
      ],
    },
  }
}

export async function buildApp({ timers = true } = {}) {
  const app = Fastify({
    trustProxy: process.env.TRUST_PROXY === 'true',
    logger: loggerOptions(),
    // Reject unknown fields instead of silently dropping them (Fastify's default), e.g. a free-text outcome reason.
    ajv: { customOptions: { removeAdditional: false } },
  })

  // No CORS: the web and admin apps proxy /api, so every request is same-origin.
  await app.register(fastifyCookie)

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Check the submitted fields.' })
    }
    if (error.statusCode === 415 || error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || error.code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Send a JSON body.' })
    }
    // Prisma messages can quote query values (emails, names), so only their code is logged.
    const prismaError = String(error?.name || '').startsWith('PrismaClient')
    request.log.error({ errName: error?.name, errCode: error?.code, ...(prismaError ? {} : { errMessage: error?.message }) }, 'request failed')
    return reply.code(500).send({ error: 'INTERNAL', message: 'Something went wrong.' })
  })

  // CSRF: data-changing requests must come from a trusted origin (see src/origin.js).
  const production = process.env.NODE_ENV === 'production'
  app.addHook('onRequest', async (request, reply) => {
    const problem = originProblem({
      method: request.method,
      path: request.url.split('?')[0],
      origin: request.headers.origin,
      secFetchSite: request.headers['sec-fetch-site'],
      production,
      trusted: TRUSTED_ORIGINS,
    })
    if (problem) {
      request.log.warn({ problem }, 'request refused by the origin check')
      return reply.code(403).send({ error: 'FORBIDDEN_ORIGIN', message: 'This request did not come from Carevia.' })
    }
  })

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'NOT_FOUND', message: 'Not found.' }))

  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/dev/outbox', async (_request, reply) => {
    if (!OUTBOX_ENABLED) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Not found.' })
    const messages = await prisma.outboxMessage.findMany({ orderBy: { sentAt: 'desc' }, take: 100 })
    return { messages: messages.map(({ id, channel, to, subject, text, links, sentAt }) => ({ id, channel, to, subject, text, links, sentAt })) }
  })

  await app.register(authRoutes)
  await app.register(catalogRoutes)
  await app.register(bookingRoutes)
  await app.register(appointmentRoutes)
  await app.register(peopleRoutes)
  await app.register(staffRoutes)
  await app.register(adminCatalogRoutes)
  await app.register(doctorApplicationRoutes)
  await app.register(doctorInviteRoutes)

  // Keep the 21-day schedule topped up (on start-up, then hourly; new days appear after midnight Lisbon time)
  // and sweep expired holds every minute. Reads never depend on the sweep: they check holdExpiresAt themselves.
  // Visit reminders go out every 5 minutes, about 24 hours before; reminderSentAt keeps it to one per visit.
  if (timers) {
    const intervals = []
    const remind = () => sendDueReminders()
      .then((sent) => { if (sent) app.log.info({ sent }, 'visit reminders sent') })
      .catch((error) => app.log.error({ errCode: error?.code }, 'visit reminders failed'))
    app.addHook('onReady', async () => {
      const added = await topUpSlots()
      app.log.info({ added }, 'slot schedule topped up')
      intervals.push(
        setInterval(() => topUpSlots().catch((error) => app.log.error({ errCode: error?.code }, 'slot top-up failed')), 60 * 60_000),
        setInterval(() => sweepExpiredHolds().catch((error) => app.log.error({ errCode: error?.code }, 'hold sweep failed')), 60_000),
        setInterval(remind, 5 * 60_000),
      )
      remind()
      for (const interval of intervals) interval.unref()
    })
    app.addHook('onClose', async () => intervals.forEach(clearInterval))
  }

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })

  return app
}

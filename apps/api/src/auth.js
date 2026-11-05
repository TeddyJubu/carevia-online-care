import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError } from 'better-auth/api'
import { fromNodeHeaders } from 'better-auth/node'
import { prisma } from './prisma.js'
import { isAdult, normalizePhone } from './rules.js'

export const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || 'http://localhost:5180').replace(/\/$/, '')
const ADMIN_APP_URL = (process.env.ADMIN_APP_URL || 'http://localhost:5174').replace(/\/$/, '')
export const SESSION_COOKIE = 'carevia.session_token'

function reject(code, message) {
  // Better Auth sends { code, message }. `error` is added so the body also matches the contract's error shape.
  throw new APIError('BAD_REQUEST', { code, error: code, message })
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : ''
}

export const auth = betterAuth({
  appName: 'Carevia',
  // Links in emails point at the web origin, which proxies /api to this server.
  baseURL: PUBLIC_APP_URL,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [PUBLIC_APP_URL, ADMIN_APP_URL],
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
  user: {
    additionalFields: {
      firstName: { type: 'string', required: true },
      lastName: { type: 'string', required: true },
      phone: { type: 'string', required: true },
      dateOfBirth: { type: 'string', required: true },
      // input: false, so nobody can sign up as a clinician or admin.
      role: { type: 'string', required: false, defaultValue: 'patient', input: false },
    },
  },
  // Profile edits go through PATCH /api/me, which only accepts first name, last name and phone.
  disabledPaths: ['/update-user'],
  advanced: { cookiePrefix: 'carevia' },
  logger: {
    level: 'error',
    // Only the message: Better Auth's extra arguments can carry request data.
    log: (level, message) => console.error(`[auth] ${level}: ${message}`),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const firstName = cleanName(user.firstName)
          const lastName = cleanName(user.lastName)
          if (!firstName || !lastName) reject('VALIDATION', 'Enter your first and last name.')
          if (!isAdult(user.dateOfBirth)) {
            reject('UNDERAGE', 'You need to be 18 or over to create an account. A parent or guardian can book for a child.')
          }
          const phone = normalizePhone(user.phone)
          if (!phone) reject('INVALID_PHONE', 'Enter your mobile number with the country code, for example +351 912 345 678.')
          return { data: { ...user, firstName, lastName, phone, name: `${firstName} ${lastName}`, role: 'patient' } }
        },
      },
    },
  },
})

/** The signed-in user, or null. */
export async function sessionUser(request) {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
  return result?.user ?? null
}

/** Shape the contract gives for `user`. */
export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth,
    role: user.role,
  }
}

/** Mounts Better Auth at /api/auth/*. */
export async function authRoutes(app) {
  // Keep the raw body: Better Auth parses it itself.
  app.removeAllContentTypeParsers()
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body))

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const headers = fromNodeHeaders(request.headers)
      // The client IP comes from the socket (or a proxy Fastify trusts), never from a header the client sent.
      headers.set('x-forwarded-for', request.ip)
      const response = await auth.handler(new Request(new URL(request.url, PUBLIC_APP_URL), {
        method: request.method,
        headers,
        body: request.method === 'GET' || !request.body?.length ? undefined : request.body,
      }))
      reply.status(response.status)
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value)
      })
      const cookies = response.headers.getSetCookie()
      if (cookies.length) reply.header('set-cookie', cookies)
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null)
    },
  })
}

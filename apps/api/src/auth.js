import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError } from 'better-auth/api'
import { fromNodeHeaders } from 'better-auth/node'
import { haveIBeenPwned } from 'better-auth/plugins/haveibeenpwned'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { DEMO_MODE } from './config.js'
import { sendMail } from './mail.js'
import { prisma } from './prisma.js'
import { isAdult, normalizePhone } from './rules.js'

// The public origins come from the environment; the localhost values are local-development defaults only.
// With an https PUBLIC_APP_URL, Better Auth sets Secure cookies (session cookie "__Secure-carevia.session_token").
export const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || 'http://localhost:5180').replace(/\/$/, '')
const ADMIN_APP_URL = (process.env.ADMIN_APP_URL || 'http://localhost:5174').replace(/\/$/, '')
// One list for Better Auth and for the origin check on every other changing route (src/origin.js).
export const TRUSTED_ORIGINS = [PUBLIC_APP_URL, ADMIN_APP_URL]

function reject(code, message) {
  // Better Auth sends { code, message }. `error` is added so the body also matches the contract's error shape.
  throw new APIError('BAD_REQUEST', { code, error: code, message })
}

// Verification links land on the account page unless the web app asked for somewhere else.
function withCallback(url, fallback) {
  const link = new URL(url)
  const current = link.searchParams.get('callbackURL')
  if (!current || current === '/') link.searchParams.set('callbackURL', fallback)
  return link.toString()
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
  trustedOrigins: TRUSTED_ORIGINS,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, token }) => {
      const link = `${PUBLIC_APP_URL}/app/reset-password?token=${encodeURIComponent(token)}`
      await sendMail({
        template: 'reset-password',
        to: user.email,
        subject: 'Reset your Carevia password',
        text: `Use this link within one hour to choose a new password:\n\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
        links: [link],
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const link = withCallback(url, '/app/account?verified=1')
      await sendMail({
        template: 'verify-email',
        to: user.email,
        subject: 'Confirm your email for Carevia',
        text: `Confirm your email address with this link:\n\n${link}`,
        links: [link],
      })
    },
  },
  // Rate limiting is on in every environment, not only in production (Better Auth's default).
  // Session checks only read the caller's own cookie, so they are not limited. Sign-in keeps
  // Better Auth's built-in 3 per 10 s per IP, and other auth routes keep 100 per minute.
  rateLimit: { enabled: true, window: 60, max: 100, storage: 'memory', customRules: { '/get-session': false } },
  plugins: [
    haveIBeenPwned({
      customPasswordCompromisedMessage: 'This password has appeared in a data breach. Choose a different one.',
    }),
    twoFactor({ issuer: 'Carevia' }),
  ],
  user: {
    additionalFields: {
      firstName: { type: 'string', required: true },
      lastName: { type: 'string', required: true },
      phone: { type: 'string', required: true },
      dateOfBirth: { type: 'string', required: true },
      // input: false, so nobody can sign up as a clinician or admin.
      role: { type: 'string', required: false, defaultValue: 'patient', input: false },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendMail({
          template: 'change-email',
          to: user.email,
          subject: 'Confirm your new Carevia email address',
          text: `Someone asked to change this account's email to ${newEmail}. Approve it with this link:\n\n${url}`,
          links: [url],
        })
      },
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
    session: {
      create: {
        before: async (session) => {
          const row = await prisma.user.findUnique({ where: { id: session.userId }, select: { disabledAt: true } })
          if (row?.disabledAt) reject('ACCOUNT_DISABLED', 'This login has been closed. Contact the Carevia team.')
          return { data: session }
        },
      },
    },
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

const STAFF = new Set(['clinician', 'admin'])

/**
 * The signed-in user if their role is allowed, else sends 401 AUTH_REQUIRED or 403 FORBIDDEN and returns null.
 * Outside demo mode, clinician and admin accounts must have two-factor login turned on (403 TWO_FACTOR_REQUIRED).
 */
export async function requireRole(request, reply, roles) {
  const user = await sessionUser(request)
  if (!user) {
    reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'Sign in to continue.' })
    return null
  }
  if (!roles.includes(user.role)) {
    reply.code(403).send({ error: 'FORBIDDEN', message: 'This account cannot do that.' })
    return null
  }
  if (STAFF.has(user.role) && !DEMO_MODE && !user.twoFactorEnabled) {
    reply.code(403).send({ error: 'TWO_FACTOR_REQUIRED', message: 'Turn on two-factor login for this account first.' })
    return null
  }
  if (user.role === 'clinician') {
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { disabledAt: true } })
    if (row?.disabledAt) {
      reply.code(403).send({ error: 'ACCOUNT_DISABLED', message: 'This login has been closed. Contact the Carevia team. There is no agenda here.' })
      return null
    }
  }
  return user
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

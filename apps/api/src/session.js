import { createHash, randomBytes } from 'node:crypto'
import { prisma } from './prisma.js'

export const SESSION_COOKIE = 'carevia_session'
const SESSION_MS = 14 * 24 * 60 * 60 * 1000

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_MS / 1000),
  }
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_MS),
    },
  })
  return token
}

export async function userFromRequest(request) {
  const token = request.cookies?.[SESSION_COOKIE]
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  return session.user
}

export async function destroySession(request) {
  const token = request.cookies?.[SESSION_COOKIE]
  if (!token) return
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

export function toPublicUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth.toISOString().slice(0, 10),
    role: user.role,
  }
}

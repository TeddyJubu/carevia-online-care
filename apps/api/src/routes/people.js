import { requireRole, toPublicUser } from '../auth.js'
import { prisma } from '../prisma.js'
import { JOIN_CLOSES_MINUTES_AFTER, isAdult, isMinor, normalizePhone, parseDate } from '../rules.js'
import { sendError } from '../views.js'

const name = { type: 'string', minLength: 1, maxLength: 80 }
const memberFields = {
  firstName: name,
  lastName: name,
  dateOfBirth: { type: 'string', minLength: 10, maxLength: 10 },
  relationship: { type: 'string', enum: ['child', 'adult'] },
}
const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } }

const toMember = ({ id, firstName, lastName, dateOfBirth, relationship }) => ({ id, firstName, lastName, dateOfBirth, relationship })

/** A child must be under 18 and an adult 18 or over. Returns an error message, or null when valid. */
function memberProblem({ firstName, lastName, dateOfBirth, relationship }) {
  if (!firstName.trim() || !lastName.trim()) return 'Enter their first and last name.'
  if (!parseDate(dateOfBirth) || (!isMinor(dateOfBirth) && !isAdult(dateOfBirth))) return 'Enter a valid date of birth.'
  if (relationship === 'child' && !isMinor(dateOfBirth)) return 'A child must be under 18. Add them as an adult instead.'
  if (relationship === 'adult' && !isAdult(dateOfBirth)) return 'An adult must be 18 or over. Add them as a child instead.'
  return null
}

const ownMember = (user, id) => prisma.familyMember.findFirst({ where: { id, userId: user.id, archivedAt: null } })

export async function peopleRoutes(app) {
  app.get('/api/family', async (request, reply) => {
    const user = await requireRole(request, reply, ['patient'])
    if (!user) return
    const members = await prisma.familyMember.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    })
    return { members: members.map(toMember) }
  })

  app.post('/api/family', {
    schema: { body: { type: 'object', additionalProperties: false, required: Object.keys(memberFields), properties: memberFields } },
  }, async (request, reply) => {
    const user = await requireRole(request, reply, ['patient'])
    if (!user) return
    const problem = memberProblem(request.body)
    if (problem) return sendError(reply, 400, 'VALIDATION', problem)
    const member = await prisma.familyMember.create({
      data: {
        userId: user.id,
        firstName: request.body.firstName.trim(),
        lastName: request.body.lastName.trim(),
        dateOfBirth: request.body.dateOfBirth,
        relationship: request.body.relationship,
      },
    })
    return reply.code(201).send({ member: toMember(member) })
  })

  app.patch('/api/family/:id', {
    schema: { params: idParams, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: memberFields } },
  }, async (request, reply) => {
    const user = await requireRole(request, reply, ['patient'])
    if (!user) return
    const member = await ownMember(user, request.params.id)
    if (!member) return sendError(reply, 404, 'NOT_FOUND', 'Family member not found.')
    const next = { ...toMember(member), ...request.body }
    const problem = memberProblem(next)
    if (problem) return sendError(reply, 400, 'VALIDATION', problem)
    const updated = await prisma.familyMember.update({
      where: { id: member.id },
      data: { firstName: next.firstName.trim(), lastName: next.lastName.trim(), dateOfBirth: next.dateOfBirth, relationship: next.relationship },
    })
    return { member: toMember(updated) }
  })

  app.delete('/api/family/:id', { schema: { params: idParams } }, async (request, reply) => {
    const user = await requireRole(request, reply, ['patient'])
    if (!user) return
    const member = await ownMember(user, request.params.id)
    if (!member) return sendError(reply, 404, 'NOT_FOUND', 'Family member not found.')
    const now = new Date()
    const upcoming = await prisma.appointment.count({
      where: {
        familyMemberId: member.id,
        OR: [
          { status: 'confirmed', endsAt: { gt: new Date(now.getTime() - JOIN_CLOSES_MINUTES_AFTER * 60_000) } },
          { status: 'held', holdExpiresAt: { gt: now } },
        ],
      },
    })
    if (upcoming) return sendError(reply, 409, 'HAS_UPCOMING', 'This person has an upcoming visit. Cancel it first.')
    await prisma.familyMember.update({ where: { id: member.id }, data: { archivedAt: now } })
    return { ok: true }
  })

  app.patch('/api/me', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: { firstName: name, lastName: name, phone: { type: 'string', maxLength: 40 } },
      },
    },
  }, async (request, reply) => {
    const user = await requireRole(request, reply, ['patient', 'clinician', 'admin'])
    if (!user) return
    const firstName = (request.body.firstName ?? user.firstName).trim()
    const lastName = (request.body.lastName ?? user.lastName).trim()
    if (!firstName || !lastName) return sendError(reply, 400, 'VALIDATION', 'Enter your first and last name.')
    const phone = request.body.phone === undefined ? user.phone : normalizePhone(request.body.phone)
    if (!phone) {
      return sendError(reply, 400, 'INVALID_PHONE', 'Enter your mobile number with the country code, for example +351 912 345 678.')
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { firstName, lastName, phone, name: `${firstName} ${lastName}` },
    })
    return { user: toPublicUser(updated) }
  })
}

import { requireRole } from '../auth.js'
import { loginState } from './doctor-invites.js'
import { prisma } from '../prisma.js'
import { sendError } from '../views.js'

export const BODIES = ['medicos', 'psicologos', 'nutricionistas']
export const BODY_LABELS = {
  medicos: 'Ordem dos Médicos',
  psicologos: 'Ordem dos Psicólogos',
  nutricionistas: 'Ordem dos Nutricionistas',
}
export const APPLICATION_STATUSES = ['new', 'contacted', 'approved', 'declined']

// Launch gates, not paperwork. Specialty's hint is filled from the application.
export const CHECKS = [
  { key: 'cedula', label: 'Cédula checked with the Ordem', hint: 'Number and body match the application.' },
  { key: 'identity', label: 'Identity matches the cédula holder', hint: 'Checked on the introductory call.' },
  { key: 'specialty', label: 'Specialty and area within competence', hint: '' },
  { key: 'insurance', label: 'Liability insurance confirmed', hint: 'Record “confirmed” and the date. Do not store policy files.' },
  { key: 'intro', label: 'Introductory call done', hint: 'Hours, services, how Carevia work works.' },
]
export const CHECK_KEYS = CHECKS.map((item) => item.key)

/** Keys still unticked. Empty means approve may be recorded. Approve still creates no login. */
export function approvalBlock(checks) {
  const have = new Set((checks || []).map((check) => check.key))
  return CHECK_KEYS.filter((key) => !have.has(key))
}

/** The reference an applicant quotes. CV-APP-0001, four digits, growing past 9999 without truncating. */
export function formatApplicationReference(ref) {
  if (typeof ref !== 'number' || !Number.isInteger(ref) || ref < 1) return ''
  return `CV-APP-${String(ref).padStart(4, '0')}`
}

function checkViews(row, groupName) {
  const byKey = new Map((row.checks || []).map((check) => [check.key, check]))
  return CHECKS.map((item) => {
    const hit = byKey.get(item.key)
    const hint = item.key === 'specialty'
      ? `${row.specialty}${groupName ? ` in ${groupName}` : ''}.`
      : item.hint
    return {
      key: item.key,
      label: item.label,
      hint,
      checked: Boolean(hit),
      checkedByName: hit?.checkedByName || '',
      checkedAt: hit?.checkedAt || null,
    }
  })
}

export function toApplication(row, groupName = '') {
  const { ref, checks, doctor: _doctor, ...rest } = row
  return {
    ...rest,
    reference: formatApplicationReference(ref),
    bodyLabel: BODY_LABELS[row.body] || row.body,
    groupName,
    checks: checkViews(row, groupName),
    readyToApprove: approvalBlock(checks).length === 0,
  }
}
const text = (max) => ({ type: 'string', minLength: 1, maxLength: max })

/** At most `max` calls per key in `windowMs`. Returns false once the key is over. */
export function makeLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map()
  return (key) => {
    const t = now()
    const recent = (hits.get(key) || []).filter((at) => t - at < windowMs)
    if (recent.length >= max) return false
    recent.push(t)
    hits.set(key, recent)
    // ponytail: in-memory and per process, so a restart forgets; move to Postgres or Redis if spam gets organised.
    if (hits.size > 10_000) hits.clear()
    return true
  }
}

export async function doctorApplicationRoutes(app) {
  const allow = makeLimiter({ max: 5, windowMs: 60 * 60_000 })

  // Public: the "Join Carevia" form. No login is created; an admin reviews the application.
  app.post('/api/doctor-applications', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['firstName', 'lastName', 'email', 'phone', 'body', 'cedula', 'specialty', 'yearsInPractice', 'languages', 'consent'],
        properties: {
          firstName: text(80),
          lastName: text(80),
          email: { type: 'string', maxLength: 200, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
          phone: { type: 'string', pattern: '^\\+[1-9]\\d{7,14}$' },
          body: { type: 'string', enum: BODIES },
          cedula: { type: 'string', pattern: '^[A-Za-z0-9-]{3,20}$' },
          specialty: text(120),
          groupSlug: { type: 'string', maxLength: 40 },
          yearsInPractice: { type: 'integer', minimum: 0, maximum: 60 },
          languages: text(200),
          message: { type: 'string', maxLength: 2000 },
          consent: { type: 'boolean', const: true },
        },
      },
    },
  }, async (request, reply) => {
    if (!allow(request.ip)) return sendError(reply, 429, 'TOO_MANY_REQUESTS', 'Too many applications from this connection. Try again in an hour.')
    const { consent: _consent, ...data } = request.body
    const row = await prisma.doctorApplication.create({ data: { ...data, email: data.email.toLowerCase() } })
    return reply.code(201).send({ id: row.id, reference: formatApplicationReference(row.ref) })
  })

  app.get('/api/admin/doctor-applications', async (request, reply) => {
    if (!(await requireRole(request, reply, ['admin']))) return
    const status = APPLICATION_STATUSES.includes(request.query.status) ? request.query.status : undefined
    const applications = await prisma.doctorApplication.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, take: 200, include: { checks: true } })
    const names = await groupNames(applications)
    return { applications: applications.map((row) => toApplication(row, names.get(row.groupSlug) || '')) }
  })

  app.get('/api/admin/doctor-applications/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } },
    },
  }, async (request, reply) => {
    if (!(await requireRole(request, reply, ['admin']))) return
    const found = await prisma.doctorApplication.findUnique({ where: { id: request.params.id } })
    if (!found) return sendError(reply, 404, 'NOT_FOUND', 'Application not found.')
    return applicationView(found.id)
  })

  app.put('/api/admin/doctor-applications/:id/checks/:key', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'key'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 64 },
          key: { type: 'string', enum: CHECK_KEYS },
        },
      },
      body: { type: 'object', additionalProperties: false, required: ['checked'], properties: { checked: { type: 'boolean' } } },
    },
  }, async (request, reply) => {
    const admin = await requireRole(request, reply, ['admin'])
    if (!admin) return
    const found = await prisma.doctorApplication.findUnique({ where: { id: request.params.id } })
    if (!found) return sendError(reply, 404, 'NOT_FOUND', 'Application not found.')
    const where = { applicationId_key: { applicationId: found.id, key: request.params.key } }
    if (request.body.checked) {
      const checkedByName = `${admin.firstName} ${admin.lastName}`.trim()
      await prisma.applicationCheck.upsert({
        where,
        update: { checkedByUserId: admin.id, checkedByName, checkedAt: new Date() },
        create: { applicationId: found.id, key: request.params.key, checkedByUserId: admin.id, checkedByName },
      })
    } else {
      await prisma.applicationCheck.deleteMany({ where: { applicationId: found.id, key: request.params.key } })
    }
    return reply.send(await applicationView(found.id))
  })

  app.patch('/api/admin/doctor-applications/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } },
      body: { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: 'string', enum: APPLICATION_STATUSES } } },
    },
  }, async (request, reply) => {
    if (!(await requireRole(request, reply, ['admin']))) return
    const found = await prisma.doctorApplication.findUnique({ where: { id: request.params.id }, include: { checks: true } })
    if (!found) return sendError(reply, 404, 'NOT_FOUND', 'Application not found.')
    if (request.body.status === 'approved' && approvalBlock(found.checks).length) {
      return sendError(reply, 409, 'CHECKS_INCOMPLETE', 'Tick every required check before approving. Approving records the decision and creates no login.')
    }
    await prisma.doctorApplication.update({ where: { id: found.id }, data: { status: request.body.status } })
    return reply.send(await applicationView(found.id))
  })
}

async function applicationView(id) {
  const row = await prisma.doctorApplication.findUnique({
    where: { id },
    include: { checks: true, doctor: { include: { clinician: true, invite: true } } },
  })
  const names = await groupNames([row])
  const application = toApplication(row, names.get(row.groupSlug) || '')
  application.login = loginState(row.doctor)
  return { application }
}

async function groupNames(rows) {
  const slugs = [...new Set(rows.map((row) => row.groupSlug).filter(Boolean))]
  if (!slugs.length) return new Map()
  const groups = await prisma.serviceGroup.findMany({ where: { slug: { in: slugs } }, select: { slug: true, name: true } })
  return new Map(groups.map((group) => [group.slug, group.name]))
}

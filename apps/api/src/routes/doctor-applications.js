import { requireRole } from '../auth.js'
import { prisma } from '../prisma.js'
import { sendError } from '../views.js'

export const BODIES = ['medicos', 'psicologos', 'nutricionistas']
export const APPLICATION_STATUSES = ['new', 'contacted', 'approved', 'declined']
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
    return reply.code(201).send({ id: row.id })
  })

  app.get('/api/admin/doctor-applications', async (request, reply) => {
    if (!(await requireRole(request, reply, ['admin']))) return
    const status = APPLICATION_STATUSES.includes(request.query.status) ? request.query.status : undefined
    const applications = await prisma.doctorApplication.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, take: 200 })
    return { applications }
  })

  app.patch('/api/admin/doctor-applications/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } },
      body: { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: 'string', enum: APPLICATION_STATUSES } } },
    },
  }, async (request, reply) => {
    if (!(await requireRole(request, reply, ['admin']))) return
    const found = await prisma.doctorApplication.findUnique({ where: { id: request.params.id } })
    if (!found) return sendError(reply, 404, 'NOT_FOUND', 'Application not found.')
    const application = await prisma.doctorApplication.update({ where: { id: found.id }, data: { status: request.body.status } })
    return { application }
  })
}

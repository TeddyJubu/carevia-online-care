import { requireRole } from '../auth.js'
import { DEMO_MODE, IMED_URL } from '../config.js'
import { dailyHint } from '../daily.js'
import { DEMO_ACCOUNTS, seedDemo } from '../demo-seed.js'
import { prisma } from '../prisma.js'
import { joinState, lisbonDayRange, lisbonToday, parseDate } from '../rules.js'
import { APPOINTMENT_INCLUDE, sendError, toAppointment } from '../views.js'
import { logAccess } from './appointments.js'

const STATUSES = ['held', 'confirmed', 'completed', 'cancelled', 'expired']
const OUTCOMES = ['completed', 'ended_poor_quality', 'needs_in_person', 'no_show']
const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } }

export async function staffRoutes(app) {
  // ---- Clinician ----

  app.get('/api/clinician/agenda', async (request, reply) => {
    const user = await requireRole(request, reply, ['clinician'])
    if (!user) return
    const date = request.query.date || lisbonToday()
    if (!parseDate(date)) return sendError(reply, 400, 'VALIDATION', 'date must be YYYY-MM-DD.')
    const doctor = await prisma.doctor.findUnique({ where: { clinicianUserId: user.id } })
    if (!doctor) return sendError(reply, 403, 'NO_DOCTOR_PROFILE', 'This login is not linked to a doctor profile.')
    const { from, to } = lisbonDayRange(date)
    const rows = await prisma.appointment.findMany({
      where: { doctorId: doctor.id, startsAt: { gte: from, lt: to }, status: { in: ['confirmed', 'completed', 'cancelled'] } },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: 'asc' },
    })
    await logAccess(user, rows.map((row) => row.id), 'GET /api/clinician/agenda')
    return {
      date,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        initials: doctor.initials,
        specialty: doctor.specialty,
        languages: doctor.languages,
        cedula: doctor.cedula,
      },
      appointments: rows.map((row) => toAppointment(row, 'clinician')),
    }
  })

  app.post('/api/clinician/appointments/:id/outcome', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['outcome'],
        properties: { outcome: { type: 'string', enum: OUTCOMES } },
      },
    },
  }, async (request, reply) => {
    const user = await requireRole(request, reply, ['clinician'])
    if (!user) return
    const appointment = await prisma.appointment.findUnique({ where: { id: request.params.id }, include: APPOINTMENT_INCLUDE })
    if (!appointment || appointment.doctor.clinicianUserId !== user.id) {
      return sendError(reply, 404, 'NOT_FOUND', 'Appointment not found.')
    }
    if (appointment.status !== 'confirmed') return sendError(reply, 409, 'NOT_CONFIRMED', 'Only a confirmed visit can get an outcome.')
    if (joinState(appointment) === 'too_early') return sendError(reply, 425, 'TOO_EARLY', 'The visit has not started yet.')
    const { outcome } = request.body
    // Poor quality keeps the visit confirmed, so the patient can reconnect or reschedule the same appointment.
    // There is no free-text reason: the clinical record is written in iMED.
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { outcome, status: outcome === 'ended_poor_quality' ? 'confirmed' : 'completed', callState: 'ended' },
    })
    const updated = await prisma.appointment.findUnique({ where: { id: appointment.id }, include: APPOINTMENT_INCLUDE })
    return { appointment: toAppointment(updated, 'clinician') }
  })

  app.get('/api/clinician/imed-link', async (request, reply) => {
    const user = await requireRole(request, reply, ['clinician'])
    if (!user) return
    return { url: IMED_URL }
  })

  // ---- Admin (operational only) ----

  app.get('/api/admin/appointments', async (request, reply) => {
    const user = await requireRole(request, reply, ['admin'])
    if (!user) return
    const { date, status } = request.query
    const where = {}
    if (date) {
      if (!parseDate(date)) return sendError(reply, 400, 'VALIDATION', 'date must be YYYY-MM-DD.')
      const { from, to } = lisbonDayRange(date)
      where.startsAt = { gte: from, lt: to }
    }
    if (status) {
      if (!STATUSES.includes(status)) return sendError(reply, 400, 'VALIDATION', `status must be one of ${STATUSES.join(', ')}.`)
      where.status = status
    }
    // ponytail: first 200 by start time, no paging; add a cursor when one day has more than 200 visits.
    const rows = await prisma.appointment.findMany({ where, include: APPOINTMENT_INCLUDE, orderBy: { startsAt: 'asc' }, take: 200 })
    await logAccess(user, rows.map((row) => row.id), 'GET /api/admin/appointments')
    return { appointments: rows.map((row) => toAppointment(row, 'admin')) }
  })

  app.get('/api/admin/access-log', async (request, reply) => {
    const user = await requireRole(request, reply, ['admin'])
    if (!user) return
    const where = request.query.appointmentId ? { appointmentId: String(request.query.appointmentId) } : {}
    const rows = await prisma.accessLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 })
    return {
      entries: rows.map((row) => ({
        id: row.id,
        at: row.createdAt,
        actorUserId: row.actorUserId,
        actorRole: row.actorRole,
        appointmentId: row.appointmentId,
        endpoint: row.endpoint,
      })),
    }
  })

  app.get('/api/admin/daily', async (request, reply) => {
    const user = await requireRole(request, reply, ['admin'])
    if (!user) return
    const settings = await prisma.dailySettings.findUnique({ where: { id: 1 } })
    return dailyHint(settings?.apiKey ?? '')
  })

  app.put('/api/admin/daily', {
    schema: {
      body: { type: 'object', additionalProperties: false, required: ['apiKey'], properties: { apiKey: { type: 'string', maxLength: 500 } } },
    },
  }, async (request, reply) => {
    const user = await requireRole(request, reply, ['admin'])
    if (!user) return
    const apiKey = request.body.apiKey.trim()
    await prisma.dailySettings.upsert({ where: { id: 1 }, update: { apiKey }, create: { id: 1, apiKey } })
    return dailyHint(apiKey)
  })

  // ---- Demo mode (DEMO_MODE=true only) ----

  app.get('/api/demo', async (_request, reply) => {
    if (!DEMO_MODE) return sendError(reply, 404, 'NOT_FOUND', 'Not found.')
    return {
      enabled: true,
      accounts: DEMO_ACCOUNTS.map(({ role, email, password, label }) => ({ role, email, password, label })),
    }
  })

  app.post('/api/demo/reset', {
    schema: {
      body: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: { startsInMinutes: { type: 'integer', minimum: 0, maximum: 120 } },
      },
    },
  }, async (request, reply) => {
    if (!DEMO_MODE) return sendError(reply, 404, 'NOT_FOUND', 'Not found.')
    const user = await requireRole(request, reply, ['admin'])
    if (!user) return
    const summary = await seedDemo(prisma, { startsInMinutes: request.body?.startsInMinutes ?? 15 })
    return { ok: true, ...summary }
  })
}

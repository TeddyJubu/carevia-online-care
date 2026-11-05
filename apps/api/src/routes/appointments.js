import { PUBLIC_APP_URL, requireRole } from '../auth.js'
import { createMeetingToken, createPrivateRoom } from '../daily.js'
import { prisma } from '../prisma.js'
import { JOIN_CLOSES_MINUTES_AFTER, canReschedule, effectiveStatus, joinState, joinWindow } from '../rules.js'
import { clashFor, sendBookingConfirmation } from './bookings.js'
import { APPOINTMENT_INCLUDE, sendError, toAppointment } from '../views.js'

const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } }
const load = (id) => prisma.appointment.findUnique({ where: { id }, include: APPOINTMENT_INCLUDE })

/** Writes one access-log row per appointment an admin or clinician read. */
export function logAccess(user, appointmentIds, endpoint) {
  if (!['admin', 'clinician'].includes(user.role) || appointmentIds.length === 0) return Promise.resolve()
  return prisma.accessLog.createMany({
    data: appointmentIds.map((appointmentId) => ({ actorUserId: user.id, actorRole: user.role, appointmentId, endpoint })),
  })
}

/**
 * The appointment if this user may act on it, else sends 404 and returns null.
 * Patients see their own; clinicians see their doctor profile's; admins (when allowed by `roles`) see all.
 */
async function accessible(request, reply, roles) {
  const user = await requireRole(request, reply, roles)
  if (!user) return {}
  const appointment = await load(request.params.id)
  const allowed = appointment && (
    (user.role === 'patient' && appointment.patientId === user.id)
    || (user.role === 'clinician' && appointment.doctor.clinicianUserId === user.id)
    || user.role === 'admin'
  )
  if (!allowed) {
    sendError(reply, 404, 'NOT_FOUND', 'Appointment not found.')
    return {}
  }
  return { user, appointment }
}

function icsText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

const icsDate = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export async function appointmentRoutes(app) {
  app.get('/api/appointments', async (request, reply) => {
    const user = await requireRole(request, reply, ['patient'])
    if (!user) return
    const scope = request.query.scope || 'upcoming'
    if (!['upcoming', 'past'].includes(scope)) return sendError(reply, 400, 'VALIDATION', 'scope must be upcoming or past.')
    const now = new Date()
    // A visit stays "upcoming" until its join window closes, so a dropped call can reconnect.
    const closedBefore = new Date(now.getTime() - JOIN_CLOSES_MINUTES_AFTER * 60_000)
    const where = scope === 'upcoming'
      ? { patientId: user.id, status: 'confirmed', endsAt: { gt: closedBefore } }
      : {
          patientId: user.id,
          OR: [{ status: { in: ['completed', 'cancelled'] } }, { status: 'confirmed', endsAt: { lte: closedBefore } }],
        }
    const rows = await prisma.appointment.findMany({
      where,
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' },
    })
    return { appointments: rows.map((row) => toAppointment(row, 'patient', now)) }
  })

  app.get('/api/appointments/:id', { schema: { params: idParams } }, async (request, reply) => {
    const { user, appointment } = await accessible(request, reply, ['patient', 'clinician', 'admin'])
    if (!appointment) return
    await logAccess(user, [appointment.id], 'GET /api/appointments/:id')
    return { appointment: toAppointment(appointment, user.role) }
  })

  app.post('/api/appointments/:id/cancel', { schema: { params: idParams } }, async (request, reply) => {
    const { appointment } = await accessible(request, reply, ['patient'])
    if (!appointment) return
    if (appointment.status !== 'confirmed') return sendError(reply, 409, 'NOT_CONFIRMED', 'Only a confirmed visit can be cancelled.')
    if (new Date() >= appointment.startsAt) {
      return sendError(reply, 409, 'TOO_LATE_TO_CANCEL', 'This visit has already started, so it can no longer be cancelled.')
    }
    // Cancelling frees the slot: the unique index only covers held and confirmed appointments.
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: 'cancelled', cancelledAt: new Date() } })
    return { appointment: toAppointment(await load(appointment.id), 'patient') }
  })

  // Moves the same appointment to another slot: same id, consent and payment; never a second appointment.
  // The partial unique index "Appointment_active_slot_key" refuses a slot that is already held or confirmed.
  app.post('/api/appointments/:id/reschedule', {
    schema: {
      params: idParams,
      body: { type: 'object', additionalProperties: false, required: ['slotId'], properties: { slotId: { type: 'integer' } } },
    },
  }, async (request, reply) => {
    const { user, appointment } = await accessible(request, reply, ['patient'])
    if (!appointment) return
    const now = new Date()
    if (!canReschedule(appointment, now)) {
      return sendError(reply, 409, 'CANNOT_RESCHEDULE', appointment.status === 'confirmed'
        ? 'This visit has started, so it can no longer be moved.'
        : 'Only a confirmed visit can be moved.')
    }
    const slot = await prisma.slot.findUnique({ where: { id: request.body.slotId }, include: { doctor: true } })
    if (!slot) return sendError(reply, 404, 'SLOT_NOT_FOUND', 'That time no longer exists. Choose another time.')
    if (slot.startsAt <= now) return sendError(reply, 400, 'VALIDATION', 'Choose a time that hasn’t passed.')
    if (slot.id === appointment.slotId) return sendError(reply, 400, 'VALIDATION', 'Your visit is already at that time.')
    if (slot.doctorId !== appointment.doctorId && slot.doctor.groupId !== appointment.service.groupId) {
      return sendError(reply, 400, 'SERVICE_MISMATCH', 'Choose the same doctor, or another doctor in the same area of care.')
    }
    if (await clashFor(appointment, slot.startsAt, slot.endsAt)) {
      return sendError(reply, 409, 'TIME_CLASH', 'There’s already a visit for this person at that time. Choose another time.')
    }
    try {
      // The fee already paid stands: moving a visit never costs extra in this build.
      // The Daily room expires with the old time, so a new one is made for the new time; pre-join is asked again.
      await prisma.appointment.update({
        where: { id: appointment.id, status: 'confirmed' },
        data: {
          slotId: slot.id, doctorId: slot.doctorId, startsAt: slot.startsAt, endsAt: slot.endsAt,
          outcome: null, callState: 'not_started', reconnects: 0, preJoinConfirmedAt: null, companion: false,
          dailyRoomName: null, dailyRoomUrl: null,
        },
      })
    } catch (error) {
      if (error?.code === 'P2002') return sendError(reply, 409, 'SLOT_TAKEN', 'That time was just booked. Choose another time.')
      // P2025: it stopped being confirmed (cancelled, or an outcome recorded) between the check and the update.
      if (error?.code === 'P2025') return sendError(reply, 409, 'CANNOT_RESCHEDULE', 'This visit can no longer be moved.')
      throw error
    }
    const moved = await load(appointment.id)
    await sendBookingConfirmation(user, moved, { moved: true })
    return { appointment: toAppointment(moved, 'patient') }
  })

  app.get('/api/appointments/:id/calendar.ics', { schema: { params: idParams } }, async (request, reply) => {
    const { appointment } = await accessible(request, reply, ['patient'])
    if (!appointment) return
    if (!['confirmed', 'completed'].includes(appointment.status)) {
      return sendError(reply, 409, 'NOT_CONFIRMED', 'Only a confirmed visit has a calendar file.')
    }
    const link = `${PUBLIC_APP_URL}/app/visits/${appointment.id}`
    // No health details: only the channel, the doctor and the link.
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Carevia//Patient journey//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${appointment.id}@carevia`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(appointment.startsAt)}`,
      `DTEND:${icsDate(appointment.endsAt)}`,
      `SUMMARY:${icsText(`Carevia video consultation with ${appointment.doctor.name}`)}`,
      `DESCRIPTION:${icsText(`Join from your Carevia account: ${link}`)}`,
      `URL:${link}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    return reply
      .type('text/calendar; charset=utf-8')
      .header('content-disposition', 'attachment; filename="carevia-visit.ics"')
      .send(ics)
  })

  app.post('/api/appointments/:id/pre-join', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['emailConfirmed', 'mobileConfirmed', 'companion'],
        properties: { emailConfirmed: { type: 'boolean' }, mobileConfirmed: { type: 'boolean' }, companion: { type: 'boolean' } },
      },
    },
  }, async (request, reply) => {
    const { appointment } = await accessible(request, reply, ['patient'])
    if (!appointment) return
    // Portuguese teleconsulta rule: confirm the email and mobile on the record before joining.
    if (request.body.emailConfirmed !== true || request.body.mobileConfirmed !== true) {
      return sendError(reply, 400, 'CONFIRMATION_REQUIRED', 'Confirm your email address and mobile number to continue.')
    }
    if (appointment.status !== 'confirmed') return sendError(reply, 409, 'NOT_CONFIRMED', 'This visit is not confirmed.')
    if (joinState(appointment) === 'closed') return sendError(reply, 410, 'WINDOW_CLOSED', 'The time to join this visit has passed.')
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { preJoinConfirmedAt: new Date(), companion: request.body.companion },
    })
    return { appointment: toAppointment(await load(appointment.id), 'patient') }
  })

  app.get('/api/video/status', async () => {
    const settings = await prisma.dailySettings.findUnique({ where: { id: 1 } })
    return { enabled: Boolean(settings?.apiKey) }
  })

  // The body is optional ({ companion: true } for the companion's token), so it has no schema.
  app.post('/api/appointments/:id/video-token', { schema: { params: idParams } }, async (request, reply) => {
    const { user, appointment } = await accessible(request, reply, ['patient', 'clinician'])
    if (!appointment) return
    const companion = request.body?.companion === true
    const status = effectiveStatus(appointment)
    if (status === 'completed') return sendError(reply, 410, 'WINDOW_CLOSED', 'This visit has ended.')
    if (status !== 'confirmed') return sendError(reply, 409, 'NOT_CONFIRMED', 'This visit is not confirmed.')
    if (user.role === 'patient' && !appointment.preJoinConfirmedAt) {
      return sendError(reply, 409, 'PRE_JOIN_REQUIRED', 'Confirm your email and mobile number before joining.')
    }
    if (companion && (user.role !== 'patient' || !appointment.companion)) {
      return sendError(reply, 409, 'COMPANION_NOT_CONFIRMED', 'Add a companion in the joining step first.')
    }
    const window = joinState(appointment)
    if (window === 'too_early') return sendError(reply, 425, 'TOO_EARLY', 'You can join 10 minutes before the visit starts.')
    if (window === 'closed') return sendError(reply, 410, 'WINDOW_CLOSED', 'The time to join this visit has passed.')

    const settings = await prisma.dailySettings.findUnique({ where: { id: 1 } })
    const apiKey = settings?.apiKey ?? ''
    if (!apiKey) {
      return sendError(reply, 409, 'VIDEO_DISABLED', 'An admin must save a Daily API key before video consultations can start.')
    }

    const { joinOpensAt, joinClosesAt } = joinWindow(appointment)
    try {
      let roomName = appointment.dailyRoomName
      let roomUrl = appointment.dailyRoomUrl
      if (!roomName) {
        const room = await createPrivateRoom(apiKey, { closesAt: joinClosesAt })
        if (!room?.name || !room?.url) throw new Error('Daily room response was incomplete')
        // Only the first request stores its room, so the doctor and patient always share one room.
        const { count } = await prisma.appointment.updateMany({
          where: { id: appointment.id, dailyRoomName: null },
          data: { dailyRoomName: room.name, dailyRoomUrl: room.url },
        })
        if (count === 1) {
          roomName = room.name
          roomUrl = room.url
        } else {
          const stored = await prisma.appointment.findUnique({ where: { id: appointment.id } })
          roomName = stored.dailyRoomName
          roomUrl = stored.dailyRoomUrl
        }
      }
      const isOwner = user.role === 'clinician'
      const issued = await createMeetingToken(apiKey, {
        roomName,
        isOwner,
        userName: isOwner ? appointment.doctor.name : companion ? 'Companion' : 'Patient',
        opensAt: joinOpensAt,
        closesAt: joinClosesAt,
      })
      if (!issued?.token) throw new Error('Daily token response was incomplete')
      return { token: issued.token, url: roomUrl, roomName, expiresAt: joinClosesAt }
    } catch (error) {
      request.log.error({ dailyStatus: error.status, appointmentId: appointment.id }, 'Daily video token failed')
      return sendError(reply, 502, 'DAILY_ERROR', 'The video service could not start this consultation.')
    }
  })

  app.post('/api/appointments/:id/call-events', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: { type: { type: 'string', enum: ['joined', 'left', 'reconnect', 'error'] } },
      },
    },
  }, async (request, reply) => {
    const { user, appointment } = await accessible(request, reply, ['patient', 'clinician'])
    if (!appointment) return
    if (!['confirmed', 'completed'].includes(appointment.status)) {
      return sendError(reply, 409, 'NOT_CONFIRMED', 'This visit is not confirmed.')
    }
    const { type } = request.body
    const data = {}
    // A drop ("left", "error") keeps the same appointment and call state, so the patient can reconnect.
    if (appointment.status === 'confirmed' && (type === 'joined' || type === 'reconnect')) data.callState = 'in_progress'
    if (type === 'reconnect') data.reconnects = { increment: 1 }
    await prisma.$transaction([
      prisma.callEvent.create({ data: { appointmentId: appointment.id, actorRole: user.role, type } }),
      prisma.appointment.update({ where: { id: appointment.id }, data }),
    ])
    const updated = await load(appointment.id)
    return { call: toAppointment(updated, user.role).call }
  })
}

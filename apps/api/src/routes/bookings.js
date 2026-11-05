import { createHash, randomBytes } from 'node:crypto'
import { PUBLIC_APP_URL, requireRole, sessionUser } from '../auth.js'
import { DEMO_MODE } from '../config.js'
import { currentConsent } from '../content.js'
import { sendMail } from '../mail.js'
import { prisma } from '../prisma.js'
import { effectiveStatus, holdExpiry, isAdult, isMinor, lisbonDateTime } from '../rules.js'
import { APPOINTMENT_INCLUDE, sendError, toAppointment } from '../views.js'

export const HOLD_COOKIE = 'carevia_hold'

const hash = (token) => createHash('sha256').update(token).digest('hex')

/**
 * The same person's other confirmed visit that overlaps [startsAt, endsAt), if any: one person can't be in two calls.
 * "Person" is the account holder (familyMemberId null) or one family member, so a parent can still book themself
 * and their child at the same time.
 * ponytail: checked before the write, not locked; two payments in the same instant could both pass. A per-patient
 * advisory lock in the pay transaction closes that if it ever matters.
 */
export function clashFor(appointment, startsAt = appointment.startsAt, endsAt = appointment.endsAt) {
  return prisma.appointment.findFirst({
    where: {
      id: { not: appointment.id }, patientId: appointment.patientId, familyMemberId: appointment.familyMemberId ?? null,
      status: 'confirmed', startsAt: { lt: endsAt }, endsAt: { gt: startsAt },
    },
    select: { id: true },
  })
}

function holdCookieHash(request) {
  const token = request.cookies?.[HOLD_COOKIE]
  return token ? hash(token) : null
}

function setHoldCookie(reply, token) {
  reply.setCookie(HOLD_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
    maxAge: 24 * 60 * 60,
  })
}

const load = (id) => prisma.appointment.findUnique({ where: { id }, include: APPOINTMENT_INCLUDE })

/**
 * The booking confirmation, to the account holder. Date, time (Lisbon), doctor and a link only: no reason for
 * the visit, no clinical data, and not the patient's name (it may be a child's). A mail failure never undoes
 * a payment that has already gone through.
 */
export async function sendBookingConfirmation(user, appointment, { moved = false } = {}) {
  const when = lisbonDateTime(appointment.startsAt)
  try {
    await sendMail({
      template: moved ? 'booking-moved' : 'booking-confirmed',
      to: user.email,
      subject: moved ? 'Your Carevia visit has a new time' : 'Your Carevia visit is booked',
      text: `Your video consultation with ${appointment.doctor.name} is ${moved ? 'now' : 'confirmed'} on ${when} (Lisbon time). `
        + 'You can join from your Carevia account 10 minutes before it starts. Not an emergency service: in an emergency, call 112.',
      links: [`${PUBLIC_APP_URL}/app/visits/${appointment.id}`],
    })
  } catch (error) {
    console.warn(`[mail] ${moved ? 'booking-moved' : 'booking-confirmed'} failed: ${error?.message}`)
  }
}

/** A held appointment owned by this patient, or sends 404 / 410 HOLD_EXPIRED / 409 NOT_HELD and returns null. */
async function ownedHold(reply, id, user) {
  const appointment = await load(id)
  if (!appointment || appointment.patientId !== user.id) {
    sendError(reply, 404, 'NOT_FOUND', 'Booking not found.')
    return null
  }
  const status = effectiveStatus(appointment)
  if (status === 'expired') {
    sendError(reply, 410, 'HOLD_EXPIRED', 'This time is no longer held for you. Choose a time again.')
    return null
  }
  if (status !== 'held') {
    sendError(reply, 409, 'NOT_HELD', 'This booking is not waiting to be completed.')
    return null
  }
  return appointment
}

const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } }

export async function bookingRoutes(app) {
  app.post('/api/bookings', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['slotId', 'serviceId', 'channel', 'for', 'inMainlandPortugal'],
        properties: {
          slotId: { type: 'integer' },
          serviceId: { type: 'integer' },
          channel: { type: 'string' },
          for: { type: 'string', enum: ['self', 'child', 'adult'] },
          inMainlandPortugal: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body
    if (body.inMainlandPortugal !== true) {
      return sendError(reply, 400, 'NOT_ELIGIBLE', 'Carevia can only see patients who are in mainland Portugal during the visit.')
    }
    if (body.channel === 'audio') return sendError(reply, 400, 'AUDIO_DISABLED', 'Audio consultations are not available yet.')
    if (body.channel !== 'video') return sendError(reply, 400, 'VALIDATION', 'Choose a video consultation.')

    const now = new Date()
    const [slot, service] = await Promise.all([
      prisma.slot.findUnique({ where: { id: body.slotId }, include: { doctor: { include: { group: true } } } }),
      prisma.service.findUnique({ where: { id: body.serviceId } }),
    ])
    if (!slot) return sendError(reply, 404, 'SLOT_NOT_FOUND', 'That time does not exist. Choose another time.')
    if (!service || !service.active) return sendError(reply, 404, 'SERVICE_NOT_FOUND', 'That service does not exist.')
    if (service.groupId !== slot.doctor.groupId) {
      return sendError(reply, 400, 'SERVICE_MISMATCH', 'This doctor does not offer that service.')
    }
    if (slot.startsAt <= now || slot.closedAt || !slot.doctor.active || !slot.doctor.group.active) {
      return sendError(reply, 409, 'SLOT_TAKEN', 'That time is no longer available. Choose another time.')
    }

    // A signed-in patient owns the hold straight away; otherwise it belongs to this browser until claimed.
    const user = await sessionUser(request)
    const patientId = user?.role === 'patient' ? user.id : null
    const token = request.cookies?.[HOLD_COOKIE] || randomBytes(32).toString('base64url')
    const tokenHash = hash(token)

    let created
    try {
      created = await prisma.$transaction(async (tx) => {
        // A new hold by the same browser releases its previous hold.
        await tx.appointment.updateMany({
          where: { holdTokenHash: tokenHash, status: 'held' },
          data: { status: 'expired', holdExpiresAt: now },
        })
        // Expired holds on this slot still say "held" until swept; free them so the unique index allows this hold.
        await tx.appointment.updateMany({
          where: { slotId: slot.id, status: 'held', holdExpiresAt: { lte: now } },
          data: { status: 'expired' },
        })
        return tx.appointment.create({
          data: {
            status: 'held',
            forWhom: body.for,
            patientId,
            patientSetAt: patientId && body.for === 'self' ? now : null,
            holdTokenHash: tokenHash,
            holdExpiresAt: holdExpiry(now),
            doctorId: slot.doctorId,
            serviceId: service.id,
            slotId: slot.id,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            channel: 'video',
            fee: slot.doctor.fee,
            inMainlandPortugal: true,
          },
        })
      })
    } catch (error) {
      // The partial unique index "Appointment_active_slot_key" turns a double booking into P2002.
      if (error?.code === 'P2002') return sendError(reply, 409, 'SLOT_TAKEN', 'That time was just booked. Choose another time.')
      throw error
    }
    setHoldCookie(reply, token)
    return reply.code(201).send({ appointment: toAppointment(await load(created.id), 'patient') })
  })

  app.post('/api/bookings/:id/claim', { schema: { params: idParams } }, async (request, reply) => {
    const user = await requireRole(request, reply, ['patient'])
    if (!user) return
    const appointment = await load(request.params.id)
    const tokenHash = holdCookieHash(request)
    const mine = appointment && (appointment.patientId === user.id
      || (!appointment.patientId && tokenHash && appointment.holdTokenHash === tokenHash))
    if (!mine) return sendError(reply, 404, 'NOT_FOUND', 'Booking not found.')
    const status = effectiveStatus(appointment)
    if (status === 'expired') return sendError(reply, 410, 'HOLD_EXPIRED', 'This time is no longer held for you. Choose a time again.')
    if (status !== 'held') return sendError(reply, 409, 'NOT_HELD', 'This booking is not waiting to be completed.')
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        patientId: user.id,
        patientSetAt: appointment.forWhom === 'self' ? (appointment.patientSetAt ?? new Date()) : appointment.patientSetAt,
      },
    })
    return { appointment: toAppointment(await load(appointment.id), 'patient') }
  })

  app.put('/api/bookings/:id/patient', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['familyMemberId'],
        properties: { familyMemberId: { type: ['string', 'null'], maxLength: 64 } },
      },
    },
  }, async (request, reply) => {
    const user = await requireRole(request, reply, ['patient'])
    if (!user) return
    const appointment = await ownedHold(reply, request.params.id, user)
    if (!appointment) return
    const { familyMemberId } = request.body
    if (familyMemberId === null) {
      if (appointment.forWhom !== 'self') {
        return sendError(reply, 400, 'FAMILY_MEMBER_REQUIRED', 'Choose who the consultation is for.')
      }
    } else {
      if (appointment.forWhom === 'self') return sendError(reply, 400, 'VALIDATION', 'This booking is for you, not a family member.')
      const member = await prisma.familyMember.findFirst({ where: { id: familyMemberId, userId: user.id, archivedAt: null } })
      if (!member) return sendError(reply, 404, 'NOT_FOUND', 'Family member not found.')
      const ageMatches = appointment.forWhom === 'child' ? isMinor(member.dateOfBirth) : isAdult(member.dateOfBirth)
      if (member.relationship !== appointment.forWhom || !ageMatches) {
        return sendError(reply, 400, 'FAMILY_MEMBER_MISMATCH', appointment.forWhom === 'child'
          ? 'Choose a child under 18 for this booking.'
          : 'Choose an adult family member for this booking.')
      }
    }
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { familyMemberId, patientSetAt: new Date() },
    })
    return { appointment: toAppointment(await load(appointment.id), 'patient') }
  })

  app.get('/api/consent/current', async () => currentConsent())

  app.post('/api/bookings/:id/consent', {
    schema: {
      params: idParams,
      body: { type: 'object', additionalProperties: false, required: ['version'], properties: { version: { type: 'string', maxLength: 100 } } },
    },
  }, async (request, reply) => {
    const user = await requireRole(request, reply, ['patient'])
    if (!user) return
    const appointment = await ownedHold(reply, request.params.id, user)
    if (!appointment) return
    if (request.body.version !== currentConsent().version) {
      return sendError(reply, 409, 'CONSENT_OUTDATED', 'The consent text has changed. Read the new version and accept it again.')
    }
    await prisma.consentRecord.create({
      data: { appointmentId: appointment.id, userId: user.id, version: request.body.version },
    })
    return { appointment: toAppointment(await load(appointment.id), 'patient') }
  })

  app.post('/api/bookings/:id/pay', {
    schema: {
      params: idParams,
      body: { type: 'object', additionalProperties: false, required: ['method'], properties: { method: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const user = await requireRole(request, reply, ['patient'])
    if (!user) return
    if (!DEMO_MODE) return sendError(reply, 501, 'PAYMENT_UNAVAILABLE', 'Payments are not available yet.')
    if (request.body.method !== 'demo') return sendError(reply, 400, 'VALIDATION', 'Only the demo payment is available.')
    const appointment = await ownedHold(reply, request.params.id, user)
    if (!appointment) return
    if (!appointment.patientSetAt) return sendError(reply, 409, 'PATIENT_REQUIRED', 'Choose who the consultation is for first.')
    if (appointment.consents[0]?.version !== currentConsent().version) {
      return sendError(reply, 409, 'CONSENT_REQUIRED', 'Read and accept the consent before paying.')
    }
    if (await clashFor(appointment)) {
      return sendError(reply, 409, 'TIME_CLASH', 'There’s already a visit for this person at this time. Choose another time.')
    }
    const now = new Date()
    const confirmed = await prisma.$transaction(async (tx) => {
      // Confirm only if the hold is still live at this instant, so an expiry cannot race the payment.
      const { count } = await tx.appointment.updateMany({
        where: { id: appointment.id, status: 'held', holdExpiresAt: { gt: now } },
        data: { status: 'confirmed', holdExpiresAt: null, holdTokenHash: null },
      })
      if (count === 0) return false
      await tx.payment.create({ data: { appointmentId: appointment.id, method: 'demo', status: 'paid', amount: appointment.fee } })
      return true
    })
    if (!confirmed) return sendError(reply, 410, 'HOLD_EXPIRED', 'This time is no longer held for you. Choose a time again.')
    await sendBookingConfirmation(user, appointment)
    return { appointment: toAppointment(await load(appointment.id), 'patient') }
  })

  app.delete('/api/bookings/:id', { schema: { params: idParams } }, async (request, reply) => {
    const user = await sessionUser(request)
    const appointment = await load(request.params.id)
    const tokenHash = holdCookieHash(request)
    const mine = appointment && ((user && appointment.patientId === user.id)
      || (tokenHash && appointment.holdTokenHash === tokenHash))
    if (!mine) return sendError(reply, 404, 'NOT_FOUND', 'Booking not found.')
    if (appointment.status !== 'held') return sendError(reply, 409, 'NOT_HELD', 'Only a held time can be released.')
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: 'expired', holdExpiresAt: new Date() } })
    return { ok: true }
  })
}

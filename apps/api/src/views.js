import { effectiveStatus, joinWindow } from './rules.js'

export const APPOINTMENT_INCLUDE = {
  service: { include: { group: true } },
  doctor: true,
  patient: { select: { firstName: true, lastName: true } },
  familyMember: { select: { firstName: true, lastName: true } },
  consents: { orderBy: { acceptedAt: 'desc' }, take: 1 },
  payment: true,
}

export function sendError(reply, status, error, message) {
  return reply.code(status).send({ error, message })
}

/**
 * The contract's appointment object, with only the fields `role` may see:
 * - patient: everything below, including payment (with amount and date paid) and reminder choices
 * - clinician: no payment, no reminders
 * - admin: operational fields only (no patient name, no consent or pre-join detail)
 * No clinical fields exist to leak. iMED status is always "not_connected" in this build.
 */
export function toAppointment(a, role, now = new Date()) {
  const status = effectiveStatus(a, now)
  const { joinOpensAt, joinClosesAt } = joinWindow(a)
  const view = {
    id: a.id,
    status,
    outcome: a.outcome,
    holdExpiresAt: status === 'held' ? a.holdExpiresAt : null,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    channel: a.channel,
    fee: a.fee,
    service: { id: a.service.id, name: a.service.name, groupSlug: a.service.group.slug, groupName: a.service.group.name },
    doctor: {
      id: a.doctor.id,
      name: a.doctor.name,
      initials: a.doctor.initials,
      specialty: a.doctor.specialty,
      languages: a.doctor.languages,
      cedula: a.doctor.cedula,
    },
    call: { joinOpensAt, joinClosesAt, state: a.callState, reconnects: a.reconnects },
    imed: { status: 'not_connected' },
  }
  if (role === 'admin') {
    view.payment = a.payment ? { status: a.payment.status, method: a.payment.method } : null
    return view
  }
  const person = a.familyMember || a.patient
  view.for = a.forWhom
  view.patient = person && a.patientSetAt
    ? { kind: a.familyMember ? 'family' : 'self', displayName: `${person.firstName} ${person.lastName}` }
    : null
  const consent = a.consents?.[0]
  view.consent = consent ? { version: consent.version, acceptedAt: consent.acceptedAt } : null
  view.preJoin = { confirmedAt: a.preJoinConfirmedAt, companion: a.companion }
  if (role === 'patient') {
    // The receipt's data: amount, method and date paid. Payment only, never anything clinical.
    view.payment = a.payment ? { status: a.payment.status, method: a.payment.method, amount: a.payment.amount, paidAt: a.payment.createdAt } : null
    view.reminders = { email: a.remindEmail, sms: a.remindSms, sentAt: a.reminderSentAt }
  }
  return view
}

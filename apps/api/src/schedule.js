import { prisma } from './prisma.js'
import { SLOT_MINUTES, lisbonTimeToUtc, lisbonToday, parseDate, scheduleFor } from './rules.js'

/** Adds any missing slots for the next 21 days. Existing slots (and their appointments) are left alone. */
export async function topUpSlots(now = new Date(), db = prisma) {
  const today = lisbonToday(now)
  const doctors = await db.doctor.findMany({ select: { id: true, availabilityIndex: true } })
  const data = doctors.flatMap((doctor) =>
    scheduleFor(doctor.availabilityIndex, today).map((slot) => ({ doctorId: doctor.id, ...slot })))
  const { count } = await db.slot.createMany({ data, skipDuplicates: true })
  return count
}

/** Marks held appointments whose hold has run out as expired, which frees their slots. */
export async function sweepExpiredHolds(now = new Date(), db = prisma) {
  const { count } = await db.appointment.updateMany({
    where: { status: 'held', OR: [{ holdExpiresAt: null }, { holdExpiresAt: { lte: now } }] },
    data: { status: 'expired' },
  })
  return count
}

/** Doctors patients can see and book: switched on, in a group that is switched on (admin Doctors and Services). */
export const LISTED_DOCTOR = { active: true, group: { active: true } }

/** Free slots: listed doctor, not removed by an admin, in the future, and not held (unexpired) or confirmed. A Prisma `where` on Slot. */
export function freeSlotWhere(now = new Date()) {
  return {
    closedAt: null,
    doctor: LISTED_DOCTOR,
    startsAt: { gt: now },
    appointments: {
      none: { OR: [{ status: 'confirmed' }, { status: 'held', holdExpiresAt: { gt: now } }] },
    },
  }
}

// A slot is taken while a live hold or a booked visit points at it.
export const LIVE = (now) => ({ OR: [{ status: { in: ['confirmed', 'completed'] } }, { status: 'held', holdExpiresAt: { gt: now } }] })

/**
 * Opens a time on a doctor's schedule (admin Doctors screen, and the doctor's own profile).
 * Returns `{ slot }`, or `{ error: [status, code, message] }`.
 */
export async function openSlot(doctorId, date, time, db = prisma) {
  const [hours, minutes] = String(time).split(':').map(Number)
  if (!parseDate(date) || !/^\d{2}:\d{2}$/.test(time) || hours > 23 || minutes > 59) {
    return { error: [400, 'VALIDATION', 'Choose a valid date and time.'] }
  }
  const startsAt = lisbonTimeToUtc(date, time)
  if (startsAt <= new Date()) return { error: [400, 'SLOT_PAST', 'Choose a time that has not already passed.'] }
  const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60_000)
  // Visits are 30 minutes, so a time that overlaps another open one on this schedule is refused.
  const clash = await db.slot.findFirst({
    where: { doctorId, closedAt: null, startsAt: { gt: new Date(startsAt.getTime() - SLOT_MINUTES * 60_000), lt: endsAt } },
  })
  if (clash) return { error: [409, 'SLOT_EXISTS', 'That time overlaps one already on this schedule.'] }
  // A time removed earlier is opened again rather than added twice.
  const slot = await db.slot.upsert({
    where: { doctorId_startsAt: { doctorId, startsAt } },
    update: { closedAt: null },
    create: { doctorId, startsAt, endsAt },
  })
  return { slot }
}

/** Removes an upcoming free time. Returns `{ ok: true }`, or `{ error: [status, code, message] }`. */
export async function closeSlot(doctorId, slotId, db = prisma) {
  const now = new Date()
  const slot = await db.slot.findFirst({ where: { id: slotId, doctorId, closedAt: null, startsAt: { gt: now } } })
  if (!slot) return { error: [404, 'NOT_FOUND', 'That time is not on the upcoming schedule.'] }
  // Closed, not deleted: the hourly top-up would add a deleted time back, and old holds still point at the row.
  // The update only matches while nothing live is on the slot, so a booking made a moment ago is not lost.
  const { count } = await db.slot.updateMany({
    where: { id: slot.id, closedAt: null, appointments: { none: LIVE(now) } },
    data: { closedAt: now },
  })
  if (count === 0) return { error: [409, 'SLOT_BOOKED', 'This time is booked. It stays on the schedule.'] }
  return { ok: true }
}

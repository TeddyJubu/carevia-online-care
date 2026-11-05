import { prisma } from './prisma.js'
import { lisbonToday, scheduleFor } from './rules.js'

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

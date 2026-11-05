import { prisma } from './prisma.js'
import { lisbonToday, scheduleFor } from './rules.js'

/** Adds any missing slots for the next 21 days. Existing slots (and their appointments) are left alone. */
export async function topUpSlots(now = new Date(), db = defaultPrisma) {
  const today = lisbonToday(now)
  const doctors = await db.doctor.findMany({ select: { id: true, availabilityIndex: true } })
  const data = doctors.flatMap((doctor) =>
    scheduleFor(doctor.availabilityIndex, today).map((slot) => ({ doctorId: doctor.id, ...slot })))
  const { count } = await db.slot.createMany({ data, skipDuplicates: true })
  return count
}

/** Marks held appointments whose hold has run out as expired, which frees their slots. */
export async function sweepExpiredHolds(now = new Date(), db = defaultPrisma) {
  const { count } = await db.appointment.updateMany({
    where: { status: 'held', OR: [{ holdExpiresAt: null }, { holdExpiresAt: { lte: now } }] },
    data: { status: 'expired' },
  })
  return count
}

/** Free slots: in the future, and not held (unexpired) or confirmed. Used as a Prisma `where` on Slot. */
export function freeSlotWhere(now = new Date()) {
  return {
    startsAt: { gt: now },
    appointments: {
      none: { OR: [{ status: 'confirmed' }, { status: 'held', holdExpiresAt: { gt: now } }] },
    },
  }
}

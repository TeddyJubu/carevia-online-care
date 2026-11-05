// Fictional demo accounts and data. No clinical content, no documents.
import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { currentConsent } from './content.js'
import { SLOT_MINUTES, addDays, lisbonTimeToUtc, lisbonToday } from './rules.js'
import { freeSlotWhere, topUpSlots } from './schedule.js'

export const DEMO_DOCTOR_ID = 0

export const DEMO_ACCOUNTS = [
  {
    role: 'patient',
    label: 'Demo patient',
    email: 'patient@example.com',
    password: 'demo-password',
    firstName: 'Demo',
    lastName: 'Patient',
    phone: '+351900000000',
    dateOfBirth: '1990-01-01',
  },
  {
    role: 'clinician',
    label: 'Demo doctor (Dr Emma Laurent)',
    email: 'doctor@carevia.test',
    password: 'doctor-demo-password',
    firstName: 'Emma',
    lastName: 'Laurent',
    phone: '+351900000001',
    dateOfBirth: '1980-01-01',
  },
  {
    role: 'admin',
    label: 'Demo admin',
    email: 'admin@carevia.test',
    password: 'admin-demo-password',
    firstName: 'Carevia',
    lastName: 'Admin',
    phone: '+351900000002',
    dateOfBirth: '1985-01-01',
  },
]

/**
 * Creates or resets a Better Auth email-and-password account directly in the database.
 * Seeding skips the sign-up hooks on purpose (the demo passwords would fail the breach check); the data above is valid.
 */
export async function upsertAccount(prisma, account) {
  const data = {
    name: `${account.firstName} ${account.lastName}`,
    firstName: account.firstName,
    lastName: account.lastName,
    phone: account.phone,
    dateOfBirth: account.dateOfBirth,
    role: account.role,
    emailVerified: true,
    twoFactorEnabled: false,
  }
  const user = await prisma.user.upsert({
    where: { email: account.email },
    update: data,
    create: { id: randomUUID(), email: account.email, ...data },
  })
  await prisma.twoFactor.deleteMany({ where: { userId: user.id } })
  const password = await hashPassword(account.password)
  await prisma.account.deleteMany({ where: { userId: user.id, providerId: 'credential' } })
  await prisma.account.create({
    data: { id: randomUUID(), accountId: user.id, providerId: 'credential', userId: user.id, password },
  })
  return user
}

/**
 * Resets everything except the catalog and the Daily key: removes appointments, family members, consent,
 * payments, call events, access logs, the outbox and every non-demo account, then recreates the demo data.
 * Demo accounts keep their ids (so a signed-in admin stays signed in after a reset).
 */
export async function seedDemo(prisma, { now = new Date(), startsInMinutes = 15 } = {}) {
  await prisma.$transaction([
    prisma.callEvent.deleteMany(),
    prisma.accessLog.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.consentRecord.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.familyMember.deleteMany(),
    prisma.outboxMessage.deleteMany(),
    prisma.user.deleteMany({ where: { email: { notIn: DEMO_ACCOUNTS.map((account) => account.email) } } }),
    prisma.slot.deleteMany(),
  ])

  const users = {}
  for (const account of DEMO_ACCOUNTS) users[account.role] = await upsertAccount(prisma, account)
  await prisma.doctor.updateMany({ where: { clinicianUserId: { not: null } }, data: { clinicianUserId: null } })
  const doctor = await prisma.doctor.update({ where: { id: DEMO_DOCTOR_ID }, data: { clinicianUserId: users.clinician.id } })

  await topUpSlots(now, prisma)

  const patient = users.patient
  const child = await prisma.familyMember.create({
    data: { userId: patient.id, firstName: 'Leo', lastName: 'Patient', dateOfBirth: '2018-03-14', relationship: 'child' },
  })
  const serviceId = async (name) => (await prisma.service.findFirstOrThrow({ where: { groupId: doctor.groupId, name } })).id
  const adultCare = await serviceId('Adult urgent care')
  const childCare = await serviceId('Child consultation')
  const consentVersion = currentConsent().version

  // A slot for the demo doctor at an exact time; generated slots that would overlap it are removed.
  async function slotAt(startsAt) {
    const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60_000)
    await prisma.slot.deleteMany({
      where: {
        doctorId: doctor.id,
        startsAt: { gt: new Date(startsAt.getTime() - SLOT_MINUTES * 60_000), lt: endsAt },
        appointments: { none: {} },
      },
    })
    return prisma.slot.create({ data: { doctorId: doctor.id, startsAt, endsAt } })
  }

  async function visit(slot, { forWhom = 'self', familyMemberId = null, service = adultCare, status = 'confirmed', outcome = null }) {
    const bookedAt = new Date(Math.min(now.getTime(), slot.startsAt.getTime() - 2 * 24 * 60 * 60_000))
    return prisma.appointment.create({
      data: {
        status,
        outcome,
        forWhom,
        patientId: patient.id,
        familyMemberId,
        patientSetAt: bookedAt,
        doctorId: doctor.id,
        serviceId: service,
        slotId: slot.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        channel: 'video',
        fee: doctor.fee,
        inMainlandPortugal: true,
        callState: status === 'completed' ? 'ended' : 'not_started',
        cancelledAt: status === 'cancelled' ? new Date(slot.startsAt.getTime() - 24 * 60 * 60_000) : null,
        consents: { create: { userId: patient.id, version: consentVersion, acceptedAt: bookedAt } },
        // Past visits were paid when booked, so receipts show a date before the visit. Upcoming ones count as paid
        // now: booked inside 24 hours, so a reset never triggers a reminder for today's visit.
        payment: { create: { method: 'demo', status: 'paid', amount: doctor.fee, createdAt: slot.startsAt < now ? bookedAt : now } },
      },
    })
  }

  // Today: about `startsInMinutes` from now (rounded up to 5 minutes), confirmed and paid. Shows the waiting room.
  const fiveMinutes = 5 * 60_000
  const todayStart = new Date(Math.ceil((now.getTime() + startsInMinutes * 60_000) / fiveMinutes) * fiveMinutes)
  await visit(await slotAt(todayStart), {})

  // In 3 days: the first free generated slot from then on, for the child.
  const childSlot = await prisma.slot.findFirstOrThrow({
    where: { ...freeSlotWhere(now), doctorId: doctor.id, startsAt: { gte: lisbonTimeToUtc(addDays(lisbonToday(now), 3), '00:00') } },
    orderBy: { startsAt: 'asc' },
  })
  await visit(childSlot, { forWhom: 'child', familyMemberId: child.id, service: childCare })

  // Past: completed, completed with needs_in_person, and cancelled. No notes, reasons or documents.
  const today = lisbonToday(now)
  const past = async (daysAgo) => slotAt(lisbonTimeToUtc(addDays(today, -daysAgo), '10:30'))
  await visit(await past(14), { status: 'completed', outcome: 'completed' })
  await visit(await past(7), { status: 'completed', outcome: 'needs_in_person' })
  await visit(await past(10), { status: 'cancelled' })

  return { appointments: 5, todayStartsAt: todayStart }
}

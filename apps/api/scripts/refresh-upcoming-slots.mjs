import { PrismaClient } from '@prisma/client'
import { slotsForDoctor } from '../src/catalog.js'

const prisma = new PrismaClient()

try {
  const now = new Date()
  const removed = await prisma.slot.deleteMany({ where: { startsAt: { lte: now } } })
  const doctors = await prisma.doctor.findMany({
    select: { id: true, availabilityIndex: true },
  })
  const data = doctors.flatMap((doctor) =>
    slotsForDoctor(doctor)
      .filter((slot) => slot.startsAt.getTime() > now.getTime())
      .map((slot) => ({ doctorId: doctor.id, ...slot })),
  )
  const added = data.length
    ? await prisma.slot.createMany({ data, skipDuplicates: true })
    : { count: 0 }
  console.log(`Removed ${removed.count} past slots. Added ${added.count} upcoming slots.`)
} finally {
  await prisma.$disconnect()
}

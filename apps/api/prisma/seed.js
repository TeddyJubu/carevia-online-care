import { PrismaClient } from '@prisma/client'
import { GROUPS, buildDoctors } from '../src/catalog.js'
import { CURATED_DOCTORS } from '../src/curated-doctors.js'
import { seedDemo } from '../src/demo-seed.js'
import { WEEKDAY_HOURS } from '../src/rules.js'

const prisma = new PrismaClient()

async function main() {
  const doctors = [...buildDoctors(), ...CURATED_DOCTORS]
  const mensHealth = GROUPS[0].services[12]
  if (mensHealth !== 'Men’s health' || mensHealth.codePointAt(3) !== 0x2019) {
    throw new Error('Men’s health must use the wireframe apostrophe U+2019')
  }
  if (doctors.length !== 270) throw new Error(`Expected 270 doctors, got ${doctors.length}`)

  // Everything that points at the catalog goes first.
  await prisma.appointment.deleteMany()
  await prisma.slot.deleteMany()
  await prisma.doctor.deleteMany()
  await prisma.service.deleteMany()
  await prisma.serviceGroup.deleteMany()

  await prisma.serviceGroup.createMany({
    data: GROUPS.map((group, id) => ({
      id,
      slug: group.slug,
      name: group.name,
      blurb: group.blurb,
      fieldMarks: group.fieldMarks.join('\n'),
      confusedWith: group.confusedWith,
      icon: group.icon,
      sortOrder: id,
    })),
  })
  // Stable ids 1-55 in catalog order, so links to a service survive a reseed.
  await prisma.service.createMany({
    data: GROUPS.flatMap((group, groupId) => group.services.map((name, sortOrder) => ({ groupId, name, sortOrder })))
      .map((service, index) => ({ id: index + 1, ...service })),
  })

  const services = await prisma.service.findMany()
  const serviceIds = new Map(services.map((service) => [`${service.groupId}:${service.name}`, service.id]))
  await prisma.doctor.createMany({
    data: doctors.map(({ service, ...doctor }) => {
      const serviceId = serviceIds.get(`${doctor.groupId}:${service}`)
      if (!serviceId) throw new Error(`Missing service for doctor ${doctor.id}`)
      // The column default is {}. Demo doctors keep the old Monday-to-Friday hours so a reseed looks the same.
      return { ...doctor, serviceId, weeklyHours: WEEKDAY_HOURS }
    }),
  })

  await prisma.dailySettings.upsert({
    where: { id: 1 },
    update: { apiKey: '' },
    create: { id: 1, apiKey: '' },
  })

  // Demo accounts, the rolling 21-day schedule and the demo appointments.
  const summary = await seedDemo(prisma)

  const counts = {
    groups: await prisma.serviceGroup.count(),
    services: await prisma.service.count(),
    doctors: await prisma.doctor.count(),
    slots: await prisma.slot.count(),
  }
  console.log(`Seeded ${counts.doctors} doctors, ${counts.services} services, ${counts.slots} slots, ${counts.groups} groups, ${summary.appointments} demo appointments.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })

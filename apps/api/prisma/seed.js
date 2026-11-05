import { PrismaClient } from '@prisma/client'
import { GROUPS, buildDoctors, slotsForDoctor } from '../src/catalog.js'
import { DEMO_ACCOUNTS, upsertAccount } from '../src/demo-seed.js'

const prisma = new PrismaClient()

async function main() {
  const doctors = buildDoctors()
  const mensHealth = GROUPS[0].services[12]
  if (mensHealth !== 'Men\u2019s health' || mensHealth.codePointAt(3) !== 0x2019) {
    throw new Error('Men’s health must use the wireframe apostrophe U+2019')
  }
  if (doctors.length !== 220) throw new Error(`Expected 220 doctors, got ${doctors.length}`)

  const slots = doctors.flatMap((doctor) =>
    slotsForDoctor(doctor).map((slot) => ({ doctorId: doctor.id, ...slot })),
  )
  if (slots.length !== 1485) throw new Error(`Expected 1485 slots, got ${slots.length}`)

  await prisma.appointment.deleteMany()
  await prisma.slot.deleteMany()
  await prisma.doctor.deleteMany()
  await prisma.service.deleteMany()
  await prisma.serviceGroup.deleteMany()

  await prisma.serviceGroup.createMany({
    data: GROUPS.map((group, id) => ({
      id,
      name: group.name,
      blurb: group.blurb,
      icon: group.icon,
      sortOrder: id,
    })),
  })
  await prisma.service.createMany({
    data: GROUPS.flatMap((group, groupId) =>
      group.services.map((name, sortOrder) => ({ groupId, name, sortOrder })),
    ),
  })

  const services = await prisma.service.findMany()
  const serviceIds = new Map(services.map((service) => [`${service.groupId}:${service.name}`, service.id]))
  const doctorRows = doctors.map((doctor) => {
    const serviceId = serviceIds.get(`${doctor.groupId}:${doctor.service}`)
    if (!serviceId) throw new Error(`Missing service for doctor ${doctor.id}`)
    return {
      id: doctor.id,
      name: doctor.name,
      initials: doctor.initials,
      specialty: doctor.specialty,
      languages: doctor.languages,
      fee: doctor.fee,
      availabilityIndex: doctor.availabilityIndex,
      experience: doctor.experience,
      education: doctor.education,
      approach: doctor.approach,
      cedula: doctor.cedula,
      groupId: doctor.groupId,
      serviceId,
    }
  })
  await prisma.doctor.createMany({ data: doctorRows })
  await prisma.slot.createMany({ data: slots })

  for (const account of DEMO_ACCOUNTS) await upsertAccount(prisma, account)
  await prisma.dailySettings.upsert({
    where: { id: 1 },
    update: { apiKey: '' },
    create: { id: 1, apiKey: '' },
  })

  const counts = {
    groups: await prisma.serviceGroup.count(),
    services: await prisma.service.count(),
    doctors: await prisma.doctor.count(),
    slots: await prisma.slot.count(),
  }
  console.log(`Seeded ${counts.doctors} doctors, ${counts.services} services, ${counts.slots} slots, ${counts.groups} groups.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })

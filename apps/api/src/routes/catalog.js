import { languageTokens } from '../catalog.js'
import { prisma } from '../prisma.js'
import { addDays, lisbonTimeToUtc, lisbonToday, parseDate } from '../rules.js'
import { LISTED_DOCTOR, freeSlotWhere } from '../schedule.js'
import { sendError } from '../views.js'

function single(value) {
  if (Array.isArray(value)) return value[0] == null ? '' : String(value[0])
  if (value == null) return ''
  return String(value)
}

function toDoctor(doctor, nextAvailableAt) {
  return {
    id: doctor.id,
    name: doctor.name,
    initials: doctor.initials,
    specialty: doctor.specialty,
    languages: doctor.languages,
    fee: doctor.fee,
    availabilityIndex: doctor.availabilityIndex,
    experience: doctor.experience,
    // Illustrative text, not a real qualification.
    education: doctor.education,
    approach: doctor.approach,
    cedula: doctor.cedula,
    group: doctor.groupId,
    groupSlug: doctor.group.slug,
    groupName: doctor.group.name,
    serviceId: doctor.serviceId,
    service: doctor.service.name,
    services: [doctor.service.name],
    ...(nextAvailableAt === undefined ? {} : { nextAvailableAt }),
  }
}

async function nextAvailable(doctorIds, now) {
  const rows = await prisma.slot.groupBy({
    by: ['doctorId'],
    where: { ...freeSlotWhere(now), doctorId: { in: doctorIds } },
    _min: { startsAt: true },
  })
  return new Map(rows.map((row) => [row.doctorId, row._min.startsAt]))
}

export async function catalogRoutes(app) {
  app.get('/api/services', async () => {
    const groups = await prisma.serviceGroup.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        services: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
        doctors: { where: { active: true }, select: { fee: true } },
      },
    })
    return {
      groups: groups.filter((group) => group.services.length > 0).map((group) => ({
        id: group.id,
        slug: group.slug,
        name: group.name,
        blurb: group.blurb,
        icon: group.icon,
        fromFee: group.doctors.length ? Math.min(...group.doctors.map((doctor) => doctor.fee)) : null,
        services: group.services.map((service) => ({ id: service.id, name: service.name })),
      })),
    }
  })

  app.get('/api/doctors', async (request, reply) => {
    const q = single(request.query.q).trim()
    const specialty = single(request.query.specialty).trim()
    const maxFee = single(request.query.maxFee).trim()
    const availability = single(request.query.availability).trim()
    const service = single(request.query.service).trim().replaceAll("'", '’')
    const group = single(request.query.group).trim()
    const groupSlug = single(request.query.groupSlug).trim()
    const language = single(request.query.language).trim()
    const sort = single(request.query.sort).trim()

    const where = { ...LISTED_DOCTOR }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { specialty: { contains: q, mode: 'insensitive' } },
        { languages: { contains: q, mode: 'insensitive' } },
        { service: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }
    if (specialty) where.specialty = specialty
    if (maxFee !== '') {
      const fee = Number(maxFee)
      if (!Number.isFinite(fee) || fee < 0) return sendError(reply, 400, 'INVALID_FILTER', 'maxFee must be a number of euros.')
      where.fee = { lte: fee }
    }
    if (availability !== '' && availability !== 'any') {
      const index = Number(availability)
      if (!Number.isInteger(index) || index < 0 || index > 2) {
        return sendError(reply, 400, 'INVALID_FILTER', 'availability must be any, 0, 1, or 2.')
      }
      where.availabilityIndex = { lte: index }
    }
    if (service) where.service = { name: service, active: true }
    if (group !== '' && group !== 'any') {
      const groupId = Number(group)
      if (!Number.isInteger(groupId)) return sendError(reply, 400, 'INVALID_FILTER', 'group must be a group id.')
      where.groupId = groupId
    }
    if (groupSlug) where.group = { ...where.group, slug: groupSlug }
    if (sort && sort !== 'first-available') return sendError(reply, 400, 'INVALID_FILTER', 'sort must be first-available.')

    const rows = await prisma.doctor.findMany({ where, include: { group: true, service: true }, orderBy: { id: 'asc' } })
    const matching = language ? rows.filter((doctor) => languageTokens(doctor.languages).includes(language)) : rows
    const next = await nextAvailable(matching.map((doctor) => doctor.id), new Date())
    const doctors = matching.map((doctor) => toDoctor(doctor, next.get(doctor.id) ?? null))
    if (sort === 'first-available') {
      doctors.sort((a, b) => (a.nextAvailableAt ?? Infinity) - (b.nextAvailableAt ?? Infinity) || a.id - b.id)
    }
    return { doctors, count: doctors.length }
  })

  app.get('/api/doctors/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id)) return sendError(reply, 400, 'VALIDATION', 'Doctor id must be a number.')
    const doctor = await prisma.doctor.findFirst({ where: { id, ...LISTED_DOCTOR }, include: { group: true, service: true } })
    if (!doctor) return sendError(reply, 404, 'NOT_FOUND', 'Doctor not found.')
    return { doctor: toDoctor(doctor) }
  })

  app.get('/api/doctors/:id/slots', async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id)) return sendError(reply, 400, 'VALIDATION', 'Doctor id must be a number.')
    const from = single(request.query.from).trim() || lisbonToday()
    const days = single(request.query.days).trim() === '' ? 7 : Number(single(request.query.days))
    if (!parseDate(from)) return sendError(reply, 400, 'VALIDATION', 'from must be a date (YYYY-MM-DD).')
    if (!Number.isInteger(days) || days < 1 || days > 21) return sendError(reply, 400, 'VALIDATION', 'days must be 1 to 21.')
    const doctor = await prisma.doctor.findFirst({ where: { id, ...LISTED_DOCTOR }, select: { id: true } })
    if (!doctor) return sendError(reply, 404, 'NOT_FOUND', 'Doctor not found.')
    const now = new Date()
    const free = freeSlotWhere(now)
    const slots = await prisma.slot.findMany({
      where: {
        ...free,
        doctorId: id,
        startsAt: { gt: now, gte: lisbonTimeToUtc(from, '00:00'), lt: lisbonTimeToUtc(addDays(from, days), '00:00') },
      },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    })
    return { doctorId: id, slots }
  })

  app.get('/api/slots/first-available', async (request, reply) => {
    const groupSlug = single(request.query.groupSlug).trim()
    const serviceText = single(request.query.serviceId).trim()
    const language = single(request.query.language).trim()
    const limitText = single(request.query.limit).trim()
    const limit = limitText === '' ? 6 : Number(limitText)
    const serviceId = serviceText === '' ? null : Number(serviceText)
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return sendError(reply, 400, 'VALIDATION', 'limit must be 1 to 50.')
    if (serviceId !== null && !Number.isInteger(serviceId)) return sendError(reply, 400, 'VALIDATION', 'serviceId must be a number.')

    const doctorWhere = { ...LISTED_DOCTOR }
    if (groupSlug) doctorWhere.group = { ...doctorWhere.group, slug: groupSlug }
    if (serviceId !== null) doctorWhere.serviceId = serviceId
    // Each language is a whole word in "English · French", so `contains` cannot match part of another language.
    if (language) doctorWhere.languages = { contains: language }
    const rows = await prisma.slot.findMany({
      where: { ...freeSlotWhere(new Date()), doctor: doctorWhere },
      orderBy: [{ startsAt: 'asc' }, { doctorId: 'asc' }],
      take: limit,
      include: { doctor: true },
    })
    return {
      slots: rows.map((slot) => ({
        id: slot.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        doctor: {
          id: slot.doctor.id,
          name: slot.doctor.name,
          initials: slot.doctor.initials,
          specialty: slot.doctor.specialty,
          languages: slot.doctor.languages,
          fee: slot.doctor.fee,
          cedula: slot.doctor.cedula,
        },
      })),
    }
  })
}

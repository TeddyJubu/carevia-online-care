// Admin management of patients, doctors, services and doctors' schedules.
import { requireRole } from '../auth.js'
import { sendMail } from '../mail.js'
import { prisma } from '../prisma.js'
import { lisbonDateTime } from '../rules.js'
import { LIVE, closeSlot, openSlot } from '../schedule.js'
import { logAccess } from './appointments.js'

const requireAdmin = (request, reply) => requireRole(request, reply, ['admin'])

function single(value) {
  if (Array.isArray(value)) return value[0] == null ? '' : String(value[0])
  if (value == null) return ''
  return String(value)
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function integerId(value) {
  const id = Number(value)
  return Number.isInteger(id) ? id : null
}

function initialsFromName(name) {
  const parts = name.replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function toPatient(user, appointmentCount) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth,
    createdAt: user.createdAt,
    appointmentCount,
  }
}

function lisbonParts(date) {
  const [day, time] = lisbonDateTime(date).split(' at ')
  return { day, time }
}

function toAppointment(row) {
  const { day, time } = lisbonParts(row.startsAt)
  return {
    id: row.id,
    doctorName: row.doctor.name,
    service: row.service.name,
    slot: `${day} · ${time}`,
    startsAt: row.startsAt,
    channel: row.channel,
    status: row.status,
    fee: row.fee,
    createdAt: row.createdAt,
  }
}

function toAdminDoctor(doctor) {
  return {
    id: doctor.id,
    name: doctor.name,
    initials: doctor.initials,
    specialty: doctor.specialty,
    languages: doctor.languages,
    fee: doctor.fee,
    experience: doctor.experience,
    education: doctor.education,
    approach: doctor.approach,
    cedula: doctor.cedula,
    active: doctor.active,
    groupId: doctor.groupId,
    groupName: doctor.group.name,
    serviceId: doctor.serviceId,
    serviceName: doctor.service.name,
    upcomingSlotCount: doctor.slots?.length ?? doctor._count?.slots ?? 0,
  }
}

function toSlot(slot) {
  const booked = slot.appointments?.[0]
  const { day, time } = lisbonParts(slot.startsAt)
  const who = booked?.familyMember || booked?.patient
  return {
    id: slot.id,
    day,
    time,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    booked: Boolean(booked),
    patientName: who ? `${who.firstName} ${who.lastName}` : '',
  }
}

function patientSearch(q) {
  if (!q) return { role: 'patient' }
  const parts = q.split(/\s+/).filter(Boolean)
  const or = [
    { firstName: { contains: q, mode: 'insensitive' } },
    { lastName: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
    { phone: { contains: q, mode: 'insensitive' } },
  ]
  if (parts.length >= 2) {
    or.push({
      AND: [
        { firstName: { contains: parts[0], mode: 'insensitive' } },
        { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' } },
      ],
    })
  }
  return { role: 'patient', OR: or }
}

const text = { type: 'string', minLength: 1, maxLength: 2000 }
const shortText = { type: 'string', minLength: 1, maxLength: 160 }

function readDoctorFields(body) {
  const name = clean(body.name)
  const specialty = clean(body.specialty)
  const languages = clean(body.languages)
  const experience = clean(body.experience)
  const education = clean(body.education)
  const approach = clean(body.approach)
  const cedula = clean(body.cedula)
  if (!name || !specialty || !languages || !experience || !education || !approach || !cedula) {
    return { error: 'Fill in the name, specialty, languages, cédula, experience, education, and approach.' }
  }
  if (!Number.isInteger(body.fee) || body.fee < 0 || body.fee > 10000) {
    return { error: 'Enter the fee as a whole number of euros.' }
  }
  if (!Number.isInteger(body.groupId) || !Number.isInteger(body.serviceId)) {
    return { error: 'Choose a service group and a service.' }
  }
  return {
    value: {
      name,
      initials: initialsFromName(name),
      specialty,
      languages,
      experience,
      education,
      approach,
      cedula,
      fee: body.fee,
      groupId: body.groupId,
      serviceId: body.serviceId,
      active: body.active !== false,
    },
  }
}

async function serviceInGroup(groupId, serviceId) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } })
  if (!service || service.groupId !== groupId) return null
  const group = await prisma.serviceGroup.findUnique({ where: { id: groupId } })
  if (!group) return null
  return { service, group }
}

export async function adminCatalogRoutes(app) {
  app.get('/api/admin/patients', async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const q = single(request.query.q).trim()
    const patients = await prisma.user.findMany({
      where: patientSearch(q),
      include: { _count: { select: { appointments: { where: { status: { not: 'expired' } } } } } },
      orderBy: { createdAt: 'desc' },
    })
    return {
      patients: patients.map((patient) => toPatient(patient, patient._count.appointments)),
      count: patients.length,
    }
  })

  app.get('/api/admin/patients/:id', async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const patient = await prisma.user.findFirst({
      where: { id: request.params.id, role: 'patient' },
      include: { _count: { select: { appointments: { where: { status: { not: 'expired' } } } } } },
    })
    if (!patient) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Patient not found.' })
    const appointments = await prisma.appointment.findMany({
      where: { patientId: patient.id, status: { not: 'expired' } },
      include: { doctor: { select: { name: true } }, service: { select: { name: true } } },
      orderBy: { startsAt: 'desc' },
    })
    await logAccess(admin, appointments.map((row) => row.id), 'GET /api/admin/patients/:id')
    return {
      patient: toPatient(patient, patient._count.appointments),
      appointments: appointments.map(toAppointment),
    }
  })

  app.patch('/api/admin/patients/:id', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          firstName: shortText,
          lastName: shortText,
          email: { type: 'string', minLength: 3, maxLength: 200 },
          phone: { type: 'string', minLength: 1, maxLength: 40 },
        },
      },
    },
  }, async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const existing = await prisma.user.findFirst({ where: { id: request.params.id, role: 'patient' } })
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Patient not found.' })

    const data = {}
    if ('firstName' in request.body) data.firstName = clean(request.body.firstName)
    if ('lastName' in request.body) data.lastName = clean(request.body.lastName)
    if ('phone' in request.body) data.phone = clean(request.body.phone)
    if ('email' in request.body) data.email = clean(request.body.email).toLowerCase()
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Nothing to update.' })
    }
    if ('firstName' in data && !data.firstName) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Enter a first name.' })
    }
    if ('lastName' in data && !data.lastName) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Enter a last name.' })
    }
    if ('phone' in data && !data.phone) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Enter a phone number.' })
    }
    if ('email' in data && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Enter a valid email address.' })
    }
    if (data.email && data.email !== existing.email) {
      const taken = await prisma.user.findUnique({ where: { email: data.email } })
      if (taken) {
        return reply.code(409).send({ error: 'EMAIL_IN_USE', message: 'An account with that email already exists.' })
      }
    }

    // Better Auth shows `name`; a changed email must be confirmed again.
    data.name = `${data.firstName ?? existing.firstName} ${data.lastName ?? existing.lastName}`
    const emailChanged = Boolean(data.email && data.email !== existing.email)
    if (emailChanged) data.emailVerified = false
    // A changed email also signs the patient out everywhere, in the same transaction.
    const [patient] = await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        data,
        include: { _count: { select: { appointments: { where: { status: { not: 'expired' } } } } } },
      }),
      ...(emailChanged ? [prisma.session.deleteMany({ where: { userId: existing.id } })] : []),
    ])
    if (emailChanged) {
      // Tell the old address, without naming the new one.
      await sendMail({
        template: 'email-changed',
        to: existing.email,
        subject: 'Your Carevia email address was changed',
        text: 'The Carevia team changed the email address on your account and signed you out on all devices. '
          + 'If you did not ask for this, reply to this email or contact Carevia support straight away.',
        links: [],
      })
    }
    return { patient: toPatient(patient, patient._count.appointments) }
  })

  app.get('/api/admin/service-groups', async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const groups = await prisma.serviceGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        services: {
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { doctors: true } } },
        },
        _count: { select: { doctors: true } },
      },
    })
    return {
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        blurb: group.blurb,
        fieldMarks: group.fieldMarks,
        confusedWith: group.confusedWith,
        icon: group.icon,
        sortOrder: group.sortOrder,
        active: group.active,
        doctorCount: group._count.doctors,
        services: group.services.map((service) => ({
          id: service.id,
          name: service.name,
          sortOrder: service.sortOrder,
          active: service.active,
          doctorCount: service._count.doctors,
        })),
      })),
    }
  })

  app.post('/api/admin/service-groups', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'blurb'],
        properties: {
          name: shortText,
          blurb: { type: 'string', minLength: 1, maxLength: 400 },
          fieldMarks: { type: 'string', maxLength: 1000 },
          confusedWith: { type: 'string', maxLength: 400 },
          icon: { type: 'string', minLength: 1, maxLength: 40 },
          sortOrder: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const name = clean(request.body.name)
    const blurb = clean(request.body.blurb)
    const icon = clean(request.body.icon) || 'stethoscope'
    if (!name || !blurb) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Enter a name and a short description.' })
    }
    const base = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'
    const group = await prisma.$transaction(async (tx) => {
      const last = await tx.serviceGroup.aggregate({ _max: { id: true, sortOrder: true } })
      const taken = new Set((await tx.serviceGroup.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((row) => row.slug))
      let slug = base
      for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`
      return tx.serviceGroup.create({
        data: {
          id: (last._max.id ?? -1) + 1,
          slug,
          name,
          blurb,
          fieldMarks: clean(request.body.fieldMarks),
          confusedWith: clean(request.body.confusedWith),
          icon,
          sortOrder: Number.isInteger(request.body.sortOrder) ? request.body.sortOrder : (last._max.sortOrder ?? -1) + 1,
        },
      })
    })
    return reply.code(201).send({
      group: { ...group, doctorCount: 0, services: [] },
    })
  })

  app.patch('/api/admin/service-groups/:id', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: shortText,
          blurb: { type: 'string', minLength: 1, maxLength: 400 },
          fieldMarks: { type: 'string', maxLength: 1000 },
          confusedWith: { type: 'string', maxLength: 400 },
          icon: { type: 'string', minLength: 1, maxLength: 40 },
          sortOrder: { type: 'integer' },
          active: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const id = integerId(request.params.id)
    if (id == null) return reply.code(400).send({ error: 'VALIDATION', message: 'Group id must be a number.' })
    const existing = await prisma.serviceGroup.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Service group not found.' })
    const data = {}
    if ('name' in request.body) data.name = clean(request.body.name)
    if ('blurb' in request.body) data.blurb = clean(request.body.blurb)
    if ('icon' in request.body) data.icon = clean(request.body.icon)
    if ('sortOrder' in request.body) data.sortOrder = request.body.sortOrder
    if ('active' in request.body) data.active = request.body.active
    const onlyCopy = 'fieldMarks' in request.body || 'confusedWith' in request.body
    if ((!Object.keys(data).length && !onlyCopy) || Object.values(data).some((value) => value === '')) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Check the group name and description.' })
    }
    // May be cleared, so set after the not-empty check above.
    if ('fieldMarks' in request.body) data.fieldMarks = clean(request.body.fieldMarks)
    if ('confusedWith' in request.body) data.confusedWith = clean(request.body.confusedWith)
    const group = await prisma.serviceGroup.update({ where: { id }, data })
    return { group }
  })

  app.post('/api/admin/services', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['groupId', 'name'],
        properties: {
          groupId: { type: 'integer' },
          name: shortText,
          sortOrder: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const name = clean(request.body.name)
    const group = await prisma.serviceGroup.findUnique({ where: { id: request.body.groupId } })
    if (!group) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Service group not found.' })
    if (!name) return reply.code(400).send({ error: 'VALIDATION', message: 'Enter a service name.' })
    const last = await prisma.service.aggregate({
      where: { groupId: group.id },
      _max: { sortOrder: true },
    })
    try {
      const service = await prisma.service.create({
        data: {
          groupId: group.id,
          name,
          sortOrder: Number.isInteger(request.body.sortOrder) ? request.body.sortOrder : (last._max.sortOrder ?? -1) + 1,
        },
      })
      return reply.code(201).send({ service: { ...service, doctorCount: 0 } })
    } catch (error) {
      if (error?.code === 'P2002') {
        return reply.code(409).send({ error: 'NAME_IN_USE', message: 'That service is already in this group.' })
      }
      throw error
    }
  })

  app.patch('/api/admin/services/:id', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: shortText,
          sortOrder: { type: 'integer' },
          groupId: { type: 'integer' },
          active: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const id = integerId(request.params.id)
    if (id == null) return reply.code(400).send({ error: 'VALIDATION', message: 'Service id must be a number.' })
    const existing = await prisma.service.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Service not found.' })
    const data = {}
    if ('name' in request.body) data.name = clean(request.body.name)
    if ('sortOrder' in request.body) data.sortOrder = request.body.sortOrder
    if ('active' in request.body) data.active = request.body.active
    if ('groupId' in request.body) {
      const group = await prisma.serviceGroup.findUnique({ where: { id: request.body.groupId } })
      if (!group) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Service group not found.' })
      data.groupId = group.id
    }
    if (!Object.keys(data).length || data.name === '') {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Enter a service name.' })
    }
    try {
      const service = await prisma.service.update({ where: { id }, data })
      return { service }
    } catch (error) {
      if (error?.code === 'P2002') {
        return reply.code(409).send({ error: 'NAME_IN_USE', message: 'That service is already in this group.' })
      }
      throw error
    }
  })

  const doctorBody = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'specialty', 'languages', 'fee', 'experience', 'education', 'approach', 'cedula', 'groupId', 'serviceId'],
    properties: {
      name: shortText,
      specialty: shortText,
      languages: shortText,
      fee: { type: 'integer', minimum: 0, maximum: 10000 },
      experience: text,
      education: text,
      approach: text,
      cedula: shortText,
      groupId: { type: 'integer' },
      serviceId: { type: 'integer' },
      active: { type: 'boolean' },
    },
  }

  app.get('/api/admin/doctors', async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const q = single(request.query.q).trim()
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { specialty: { contains: q, mode: 'insensitive' } },
            { cedula: { contains: q, mode: 'insensitive' } },
            { service: { name: { contains: q, mode: 'insensitive' } } },
            { group: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}
    const now = new Date()
    const doctors = await prisma.doctor.findMany({
      where,
      include: {
        group: true,
        service: true,
        slots: { where: { startsAt: { gt: now }, closedAt: null }, select: { id: true } },
      },
      orderBy: { name: 'asc' },
    })
    return { doctors: doctors.map(toAdminDoctor), count: doctors.length }
  })

  app.get('/api/admin/doctors/:id', async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const id = integerId(request.params.id)
    if (id == null) return reply.code(400).send({ error: 'VALIDATION', message: 'Doctor id must be a number.' })
    const now = new Date()
    const doctor = await prisma.doctor.findUnique({
      where: { id },
      include: {
        group: true,
        service: true,
        slots: { where: { startsAt: { gt: now }, closedAt: null }, select: { id: true } },
      },
    })
    if (!doctor) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Doctor not found.' })
    return { doctor: toAdminDoctor(doctor) }
  })

  app.post('/api/admin/doctors', { schema: { body: doctorBody } }, async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const parsed = readDoctorFields(request.body)
    if (parsed.error) return reply.code(400).send({ error: 'VALIDATION', message: parsed.error })
    const match = await serviceInGroup(parsed.value.groupId, parsed.value.serviceId)
    if (!match) {
      return reply.code(400).send({ error: 'SERVICE_MISMATCH', message: 'Choose a service from the selected group.' })
    }
    const doctor = await prisma.$transaction(async (tx) => {
      const last = await tx.doctor.aggregate({ _max: { id: true } })
      return tx.doctor.create({
        data: {
          id: (last._max.id ?? -1) + 1,
          ...parsed.value,
          availabilityIndex: 0,
        },
        include: { group: true, service: true, slots: { select: { id: true } } },
      })
    })
    return reply.code(201).send({ doctor: toAdminDoctor(doctor) })
  })

  app.patch('/api/admin/doctors/:id', { schema: { body: doctorBody } }, async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const id = integerId(request.params.id)
    if (id == null) return reply.code(400).send({ error: 'VALIDATION', message: 'Doctor id must be a number.' })
    const existing = await prisma.doctor.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Doctor not found.' })
    const parsed = readDoctorFields(request.body)
    if (parsed.error) return reply.code(400).send({ error: 'VALIDATION', message: parsed.error })
    const match = await serviceInGroup(parsed.value.groupId, parsed.value.serviceId)
    if (!match) {
      return reply.code(400).send({ error: 'SERVICE_MISMATCH', message: 'Choose a service from the selected group.' })
    }
    const now = new Date()
    const doctor = await prisma.doctor.update({
      where: { id },
      data: parsed.value,
      include: {
        group: true,
        service: true,
        slots: { where: { startsAt: { gt: now }, closedAt: null }, select: { id: true } },
      },
    })
    return { doctor: toAdminDoctor(doctor) }
  })

  app.get('/api/admin/doctors/:id/slots', async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const id = integerId(request.params.id)
    if (id == null) return reply.code(400).send({ error: 'VALIDATION', message: 'Doctor id must be a number.' })
    const doctor = await prisma.doctor.findUnique({ where: { id } })
    if (!doctor) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Doctor not found.' })
    const now = new Date()
    const slots = await prisma.slot.findMany({
      where: { doctorId: id, startsAt: { gt: now }, closedAt: null },
      orderBy: { startsAt: 'asc' },
      include: {
        appointments: {
          where: LIVE(now),
          take: 1,
          select: {
            id: true,
            patient: { select: { firstName: true, lastName: true } },
            familyMember: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })
    await logAccess(admin, slots.flatMap((slot) => slot.appointments.map((row) => row.id)), 'GET /api/admin/doctors/:id/slots')
    return { slots: slots.map(toSlot) }
  })

  app.post('/api/admin/doctors/:id/slots', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'time'],
        properties: {
          date: { type: 'string', minLength: 10, maxLength: 10 },
          time: { type: 'string', minLength: 5, maxLength: 5 },
        },
      },
    },
  }, async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const id = integerId(request.params.id)
    if (id == null) return reply.code(400).send({ error: 'VALIDATION', message: 'Doctor id must be a number.' })
    const doctor = await prisma.doctor.findUnique({ where: { id } })
    if (!doctor) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Doctor not found.' })
    const { slot, error } = await openSlot(id, request.body.date, request.body.time)
    if (error) return reply.code(error[0]).send({ error: error[1], message: error[2] })
    return reply.code(201).send({ slot: toSlot(slot) })
  })

  app.delete('/api/admin/doctors/:id/slots/:slotId', async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const doctorId = integerId(request.params.id)
    const slotId = integerId(request.params.slotId)
    if (doctorId == null || slotId == null) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Doctor and time must be numbers.' })
    }
    const { error } = await closeSlot(doctorId, slotId)
    if (error) return reply.code(error[0]).send({ error: error[1], message: error[2] })
    return { ok: true }
  })
}

import { PUBLIC_APP_URL } from './auth.js'
import { sendMail, sendSms } from './mail.js'
import { prisma } from './prisma.js'
import { REMINDER_HOURS_BEFORE, lisbonDateTime, reminderDue } from './rules.js'

/**
 * Sends the one reminder owed for each visit starting within the next 24 hours (see reminderDue), by email and/or
 * SMS as the patient chose. The Lisbon time, the doctor and the visit link only: no patient name (it may be a
 * child's) and no reason for the visit, as in the confirmation. Returns how many appointments were reminded.
 * Each appointment is claimed by setting reminderSentAt before anything is sent, so a second run, a restart or a
 * second API process can never send it twice. A crash between the claim and the send loses that reminder instead.
 */
export async function sendDueReminders(now = new Date()) {
  const candidates = await prisma.appointment.findMany({
    where: {
      status: 'confirmed',
      reminderSentAt: null,
      startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_HOURS_BEFORE * 3_600_000) },
      OR: [{ remindEmail: true }, { remindSms: true }],
    },
    include: { payment: true, doctor: { select: { name: true } }, patient: { select: { email: true, phone: true } } },
  })
  let sent = 0
  for (const appointment of candidates.filter((a) => a.patient && reminderDue(a, now))) {
    const { count } = await prisma.appointment.updateMany({ where: { id: appointment.id, reminderSentAt: null }, data: { reminderSentAt: now } })
    if (count !== 1) continue
    const when = lisbonDateTime(appointment.startsAt)
    const link = `${PUBLIC_APP_URL}/app/visits/${appointment.id}`
    const doctor = appointment.doctor.name
    try {
      if (appointment.remindEmail) {
        await sendMail({
          template: 'visit-reminder',
          to: appointment.patient.email,
          subject: 'Reminder: your Carevia visit',
          text: `A reminder: your video consultation with ${doctor} is on ${when} (Lisbon time). `
            + 'You can join from your Carevia account 10 minutes before it starts. Not an emergency service: in an emergency, call 112.',
          links: [link],
        })
      }
      if (appointment.remindSms) {
        await sendSms({
          template: 'visit-reminder',
          to: appointment.patient.phone,
          text: `Carevia: your video consultation with ${doctor} is on ${when} (Lisbon time). Join 10 minutes before from your account. In an emergency, call 112.`,
          links: [link],
        })
      }
      sent += 1
    } catch (error) {
      console.warn(`[reminders] ${appointment.id} failed: ${error?.code ?? error?.name}`)
    }
  }
  return sent
}

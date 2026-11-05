import { OUTBOX_ENABLED } from './config.js'
import { prisma } from './prisma.js'

// ponytail: no real email sender in this build (backlog). Outside demo and development, emails are dropped
// with a log line that names only the template, never the address.
export async function sendMail({ template, to, subject, text, links }) {
  if (!OUTBOX_ENABLED) {
    console.warn(`[mail] not sent (${template}): no email provider is configured`)
    return
  }
  await prisma.outboxMessage.create({ data: { to, subject, text, links } })
}

// No SMS provider exists yet. In demo and development the message is written to the outbox, marked as SMS and
// "not sent", so the demo shows what it would say; it is never delivered, and nothing claims it was.
export async function sendSms({ template, to, text, links }) {
  if (!OUTBOX_ENABLED) {
    console.warn(`[sms] not sent (${template}): no SMS provider is configured`)
    return
  }
  await prisma.outboxMessage.create({ data: { channel: 'sms', to, subject: 'SMS (not sent: no SMS provider yet)', text, links } })
}

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

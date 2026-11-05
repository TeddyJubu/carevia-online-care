// Fictional demo accounts and data. No clinical content, no documents.
import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'

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
  }
  const user = await prisma.user.upsert({
    where: { email: account.email },
    update: data,
    create: { id: randomUUID(), email: account.email, ...data },
  })
  const password = await hashPassword(account.password)
  await prisma.account.deleteMany({ where: { userId: user.id, providerId: 'credential' } })
  await prisma.account.create({
    data: { id: randomUUID(), accountId: user.id, providerId: 'credential', userId: user.id, password },
  })
  return user
}

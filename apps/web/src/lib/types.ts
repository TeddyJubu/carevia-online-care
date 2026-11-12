// Shapes from docs/patient-journey/API-CONTRACT.md. No clinical fields exist here, by design.

export type Role = 'patient' | 'clinician' | 'admin'

export type User = {
  id: string
  email: string
  emailVerified: boolean
  firstName: string
  lastName: string
  phone: string
  dateOfBirth: string
  role: Role
  twoFactorEnabled?: boolean
}

export type Session = { session: { id: string; expiresAt: string }; user: User }

export type GroupSlug = 'general' | 'mental' | 'nutrition' | 'specialist' | 'certificates' | 'treatments' | 'renewals'

export type ServiceGroup = {
  id: number
  slug: GroupSlug
  name: string
  blurb: string
  /** Signs that this is the right group, one per item. Editable in admin. */
  fieldMarks: string[]
  /** "Other group: when to choose that instead." Empty when not set. */
  confusedWith: string
  /** Open slots per Lisbon day, today first, 7 days. */
  week: number[]
  nextAvailableAt: string | null
  icon: string
  fromFee: number
  services: { id: number; name: string }[]
}

export type Doctor = {
  id: number
  name: string
  initials: string
  specialty: string
  languages: string
  fee: number
  cedula: string
  experience?: string
  education?: string
  approach?: string
  group?: number
  groupSlug?: string
  groupName?: string
  service?: string
  nextAvailableAt?: string | null
}

/** A time on the signed-in doctor's own schedule (GET /api/clinician/schedule). Removed times stay listed so they can be opened again. */
export type OwnSlot = { id: number; startsAt: string; endsAt: string; open: boolean; booked: boolean }

export type DoctorBrief = Pick<Doctor, 'id' | 'name' | 'initials' | 'specialty' | 'languages' | 'cedula'> & { fee?: number }

// The contract leaves the slot id type open (the database uses integers); treat it as opaque.
export type SlotId = number | string
export type Slot = { id: SlotId; startsAt: string; endsAt: string }
export type SlotWithDoctor = Slot & { doctor: DoctorBrief & { fee: number } }

export type For = 'self' | 'child' | 'adult'
export type Status = 'held' | 'confirmed' | 'completed' | 'cancelled' | 'expired'
export type Outcome = 'completed' | 'ended_poor_quality' | 'needs_in_person' | 'no_show'
export type CallState = 'not_started' | 'in_progress' | 'ended'

export type Appointment = {
  id: string
  status: Status
  outcome: Outcome | null
  holdExpiresAt: string | null
  startsAt: string
  endsAt: string
  channel: 'video'
  fee: number
  for?: For
  service: { id: number; name: string; groupSlug: GroupSlug; groupName: string }
  doctor: DoctorBrief
  patient: { kind: 'self' | 'family'; displayName: string } | null
  consent: { version: string; acceptedAt: string } | null
  // Patient view only. Demo payments take no money; 'refunded' is reserved for a real provider (backlog).
  payment: { status: 'paid' | 'refunded'; method: 'demo'; amount: number; paidAt: string } | null
  reminders?: { email: boolean; sms: boolean; sentAt: string | null }
  preJoin: { confirmedAt: string | null; companion: boolean } | null
  cancelledBy: 'patient' | 'admin' | 'clinician' | null
  call: { joinOpensAt: string; joinClosesAt: string; state: CallState; reconnects: number; doctorJoined: boolean }
  imed: { status: 'not_connected' }
}

export type FamilyMember = { id: string; firstName: string; lastName: string; dateOfBirth: string; relationship: 'child' | 'adult' }

export type Consent = { version: string; title: string; body: string; recordingOffered: false }

export type VideoToken = { token: string; url: string; roomName: string; expiresAt: string }

export type DemoInfo = { enabled: true; accounts: { role: Role; email: string; password: string; label: string }[] }

export type OutboxMessage = { id: string; channel?: 'email' | 'sms'; to: string; subject: string; text: string; links: string[]; sentAt: string }

export type CallEvent = 'joined' | 'left' | 'reconnect' | 'error'

import type {
  Appointment, CallEvent, Consent, DemoInfo, Doctor, FamilyMember, For, GroupSlug, Outcome,
  OutboxMessage, ServiceGroup, Session, Slot, SlotId, SlotWithDoctor, User, VideoToken,
} from './types'

export const MOCK = import.meta.env.VITE_API_MOCK === '1'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

const FALLBACK = 'Something went wrong on our side. Please try again.'

// Better Auth codes the patient may see, in Carevia's words.
const AUTH_MESSAGES: Record<string, string> = {
  PASSWORD_COMPROMISED: 'This password has appeared in a data breach. Choose a different one.',
  INVALID_EMAIL_OR_PASSWORD: 'That email and password don’t match. Check them and try again.',
  USER_ALREADY_EXISTS: 'There’s already an account with this email. Sign in instead.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'There’s already an account with this email. Sign in instead.',
  UNDERAGE: 'You need to be 18 or over to create an account. A parent or guardian can book for a child.',
  INVALID_TWO_FACTOR_CODE: 'That code didn’t work. Check your authenticator app and try again.',
  INVALID_CODE: 'That code didn’t work. Check your authenticator app and try again.',
  INVALID_PASSWORD: 'That password is not right.',
  PASSWORD_TOO_SHORT: 'Use at least 8 characters.',
  TOO_MANY_REQUESTS: 'Too many attempts. Wait a minute, then try again.',
  HTTP_429: 'Too many attempts. Wait a minute, then try again.', // Better Auth's rate limiter sends no code
  TWO_FACTOR_REQUIRED: 'Doctor and admin accounts need two-factor sign-in. Turn it on, then try again.',
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let status: number
  let data: any
  // Inline env check (not MOCK) so the bundler drops the mock chunk, demo passwords included, from normal builds.
  if (import.meta.env.VITE_API_MOCK === '1') {
    const { handle } = await import('./mock')
    ;({ status, data } = await handle(method, path, body))
  } else {
    let res: Response
    try {
      res = await fetch(path, {
        method,
        credentials: 'include',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(0, 'NETWORK', 'We couldn’t reach Carevia. Check your connection and try again.')
    }
    status = res.status
    const text = await res.text()
    try { data = text ? JSON.parse(text) : null } catch { data = null }
  }
  if (status >= 400) {
    const code: string = (typeof data?.error === 'string' && data.error) || data?.code || `HTTP_${status}`
    throw new ApiError(status, code, AUTH_MESSAGES[code] ?? data?.message ?? FALLBACK)
  }
  return data as T
}

const get = <T>(p: string) => request<T>('GET', p)
const post = <T>(p: string, b: unknown = {}) => request<T>('POST', p, b)
const qs = (o: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
  const out = s.toString()
  return out ? `?${out}` : ''
}

type SignUp = { email: string; password: string; firstName: string; lastName: string; phone: string; dateOfBirth: string }
type A = { appointment: Appointment }

export const api = {
  auth: {
    session: () => get<Session | null>('/api/auth/get-session'),
    signUp: (b: SignUp) => post<{ user: User }>('/api/auth/sign-up/email', { ...b, name: `${b.firstName} ${b.lastName}` }),
    signIn: (email: string, password: string) =>
      post<{ user?: User; twoFactorRedirect?: boolean }>('/api/auth/sign-in/email', { email, password }),
    verifyTotp: (code: string) => post<{ user?: User }>('/api/auth/two-factor/verify-totp', { code }),
    signOut: () => post<unknown>('/api/auth/sign-out'),
    requestReset: (email: string) =>
      post<unknown>('/api/auth/request-password-reset', { email, redirectTo: `${location.origin}/app/reset-password` }),
    resetPassword: (token: string, newPassword: string) => post<unknown>('/api/auth/reset-password', { token, newPassword }),
    changePassword: (currentPassword: string, newPassword: string) =>
      post<unknown>('/api/auth/change-password', { currentPassword, newPassword, revokeOtherSessions: true }),
    enableTwoFactor: (password: string) => post<{ totpURI: string; backupCodes: string[] }>('/api/auth/two-factor/enable', { password }),
    disableTwoFactor: (password: string) => post<unknown>('/api/auth/two-factor/disable', { password }),
  },
  services: () => get<{ groups: ServiceGroup[] }>('/api/services'),
  doctors: (f: { groupSlug?: GroupSlug; service?: string; language?: string; sort?: 'first-available' }) =>
    get<{ doctors: Doctor[] }>(`/api/doctors${qs(f)}`),
  doctor: (id: number) => get<{ doctor: Doctor }>(`/api/doctors/${id}`),
  slots: (doctorId: number, from: string, days = 1) =>
    get<{ doctorId: number; slots: Slot[] }>(`/api/doctors/${doctorId}/slots${qs({ from, days })}`),
  firstAvailable: (f: { groupSlug?: GroupSlug; serviceId?: number; language?: string; limit?: number }) =>
    get<{ slots: SlotWithDoctor[] }>(`/api/slots/first-available${qs(f)}`),

  hold: (b: { slotId: SlotId; serviceId: number; for: For }) =>
    post<A>('/api/bookings', { ...b, channel: 'video', inMainlandPortugal: true }),
  claim: (id: string) => post<A>(`/api/bookings/${id}/claim`),
  setPatient: (id: string, familyMemberId: string | null) => request<A>('PUT', `/api/bookings/${id}/patient`, { familyMemberId }),
  consent: () => get<Consent>('/api/consent/current'),
  acceptConsent: (id: string, version: string) => post<A>(`/api/bookings/${id}/consent`, { version }),
  pay: (id: string) => post<A>(`/api/bookings/${id}/pay`, { method: 'demo' }),
  release: (id: string) => request<unknown>('DELETE', `/api/bookings/${id}`),

  appointments: (scope: 'upcoming' | 'past') => get<{ appointments: Appointment[] }>(`/api/appointments?scope=${scope}`),
  appointment: (id: string) => get<A>(`/api/appointments/${id}`),
  cancel: (id: string) => post<A>(`/api/appointments/${id}/cancel`),
  reschedule: (id: string, slotId: SlotId) => post<A>(`/api/appointments/${id}/reschedule`, { slotId }),
  setReminders: (id: string, email: boolean, sms: boolean) => request<A>('PUT', `/api/appointments/${id}/reminders`, { email, sms }),
  calendarUrl: (id: string) => `/api/appointments/${id}/calendar.ics`,
  preJoin: (id: string, companion: boolean) =>
    post<A>(`/api/appointments/${id}/pre-join`, { emailConfirmed: true, mobileConfirmed: true, companion }),
  videoToken: (id: string, companion = false) => post<VideoToken>(`/api/appointments/${id}/video-token`, companion ? { companion: true } : {}),
  // TEMPORARY, demo only: moves the visit to start now. Remove with the test button on the appointments page.
  testJoin: (id: string) => post<A>(`/api/appointments/${id}/test-join`),
  callEvent: (id: string, type: CallEvent) => post<unknown>(`/api/appointments/${id}/call-events`, { type }),
  videoStatus: () => get<{ enabled: boolean }>('/api/video/status'),

  family: () => get<{ members: FamilyMember[] }>('/api/family'),
  addFamily: (m: Omit<FamilyMember, 'id'>) => post<{ member: FamilyMember }>('/api/family', m),
  updateFamily: (id: string, m: Partial<Omit<FamilyMember, 'id'>>) => request<{ member: FamilyMember }>('PATCH', `/api/family/${id}`, m),
  removeFamily: (id: string) => request<unknown>('DELETE', `/api/family/${id}`),
  updateMe: (b: { firstName?: string; lastName?: string; phone?: string }) => request<{ user: User }>('PATCH', '/api/me', b),

  agenda: (date: string) => get<{ doctor: Doctor; appointments: Appointment[] }>(`/api/clinician/agenda?date=${date}`),
  recordOutcome: (id: string, outcome: Outcome) => post<A>(`/api/clinician/appointments/${id}/outcome`, { outcome }),
  imedLink: () => get<{ url: string }>('/api/clinician/imed-link'),

  demo: () => get<DemoInfo>('/api/demo'),
  outbox: () => get<{ messages: OutboxMessage[] }>('/api/dev/outbox'),
}

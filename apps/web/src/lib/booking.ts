import { useState } from 'react'
import type { Appointment, For, GroupSlug } from './types'

// The booking in progress, kept for this tab only. Once a hold exists, the appointment from the API is the truth.
export type Draft = {
  groupSlug?: GroupSlug
  serviceId?: number
  for?: For
  inMainland?: boolean
  doctorId?: number // preferred doctor, e.g. "book a follow-up"
  appointmentId?: string
}

const KEY = 'carevia-booking'
const read = (): Draft => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') } catch { return {} } }

export function useDraft(): [Draft, (patch: Partial<Draft>) => void, () => void] {
  const [draft, setDraft] = useState<Draft>(read)
  const update = (patch: Partial<Draft>) => {
    const next = { ...read(), ...patch }
    sessionStorage.setItem(KEY, JSON.stringify(next))
    setDraft(next)
  }
  const clear = () => { sessionStorage.removeItem(KEY); setDraft({}) }
  return [draft, update, clear]
}

/** Which booking step a held appointment should resume at. */
export function nextStep(a: Appointment, signedIn: boolean): string {
  if (a.status === 'confirmed') return `/visits/${a.id}`
  if (!signedIn) return '/book/account'
  if (!a.patient) return a.for && a.for !== 'self' ? '/book/family' : '/book/account'
  if (!a.consent) return '/book/consent'
  return '/book/pay'
}

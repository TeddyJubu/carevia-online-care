import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../lib/api'
import { useLoad } from '../lib/load'
import { addDays, dayLabel, hhmm, lisbonDay } from '../lib/time'
import type { Doctor, GroupSlug, SlotWithDoctor } from '../lib/types'
import { Dialog, DoctorAvatar, ErrorState, euro, Field, FormError, Loading } from '../ui/kit'

// The doctor-and-time picker used by reschedule (visit.tsx). Booking itself is Services v2.

function Actions({ back, children }: { back?: string; children: ReactNode }) {
  return (
    <div className="mt-10 flex flex-wrap items-center gap-3 max-sm:sticky max-sm:bottom-0 max-sm:-mx-4 max-sm:border-t max-sm:border-[#102d5014] max-sm:bg-paper/95 max-sm:px-4 max-sm:py-3 max-sm:backdrop-blur">
      {back && <Link to={back} className="btn btn-secondary">Back</Link>}
      {children}
    </div>
  )
}

type Mode = 'first' | 'today' | 'tomorrow' | 'date'
const LANGUAGES = ['English', 'Portuguese', 'French', 'German', 'Spanish', 'Italian']
const PRICE_CAPS = [60, 80, 100, 150]
type Row = { doctor: SlotWithDoctor['doctor']; slots: { id: SlotWithDoctor['id']; startsAt: string }[] }

export type Picked = { id: Row['slots'][0]['id']; startsAt: string; doctor: Row['doctor'] }

/**
 * The J3 doctor-and-time picker, shared by booking and reschedule: first available, day filters and language,
 * doctors with their times. `submit` gets the chosen slot; a SLOT_TAKEN error reloads the times.
 */
export function TimePicker({ groupSlug, service, preferredDoctorId, preferredLabel = 'Your last doctor', includePreferred, back, verb, pendingLabel, submit }: {
  groupSlug: GroupSlug
  service: { id: number; name: string }
  preferredDoctorId?: number
  preferredLabel?: string
  /** Reschedule: always offer the preferred doctor's own times, even if they don't list this exact service. */
  includePreferred?: boolean
  back: string
  verb: string
  pendingLabel: string
  submit: (picked: Picked) => Promise<void>
}) {
  const [mode, setMode] = useState<Mode>('first')
  const [date, setDate] = useState(addDays(lisbonDay(), 2))
  const [language, setLanguage] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [picked, setPicked] = useState<Picked | null>(null)
  const [profile, setProfile] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const day = mode === 'today' ? lisbonDay() : mode === 'tomorrow' ? addDays(lisbonDay(), 1) : date
  const rows = useLoad<Row[]>(async () => {
    const list = await listRows()
    if (!includePreferred || preferredDoctorId === undefined || list.some((r) => r.doctor.id === preferredDoctorId)) return list
    const [{ doctor }, { slots }] = await Promise.all([api.doctor(preferredDoctorId), api.slots(preferredDoctorId, mode === 'first' ? lisbonDay() : day, mode === 'first' ? 7 : 1)])
    if (language && !doctor.languages.split(' · ').includes(language)) return list
    return slots.length ? [{ doctor, slots: mode === 'first' ? slots.slice(0, 6) : slots }, ...list] : list
  }, [groupSlug, service.id, mode, day, language, includePreferred, preferredDoctorId])

  async function listRows(): Promise<Row[]> {
    if (mode === 'first') {
      const { slots } = await api.firstAvailable({ groupSlug, serviceId: service.id, language: language || undefined, limit: 12 })
      const byDoc = new Map<number, Row>()
      for (const s of slots) {
        const r = byDoc.get(s.doctor.id) ?? { doctor: s.doctor, slots: [] }
        r.slots.push(s)
        byDoc.set(s.doctor.id, r)
      }
      return [...byDoc.values()]
    }
    const { doctors } = await api.doctors({ groupSlug, service: service.name, language: language || undefined })
    const withSlots = await Promise.all(doctors.map(async (d: Doctor) => ({ doctor: { ...d, fee: d.fee }, slots: (await api.slots(d.id, day, 1)).slots })))
    return withSlots.filter((r) => r.slots.length)
  }

  // A follow-up's doctor goes first. ponytail: price is filtered client-side; first-available fetches 12 slots, so a tight cap can show fewer doctors. Push it to the API if that bites.
  const sorted = useMemo(() => {
    const list = (rows.data ?? []).filter((r) => !maxPrice || r.doctor.fee == null || r.doctor.fee <= Number(maxPrice))
    return preferredDoctorId === undefined ? list : [...list].sort((a, b) => Number(b.doctor.id === preferredDoctorId) - Number(a.doctor.id === preferredDoctorId))
  }, [rows.data, preferredDoctorId, maxPrice])

  async function go() {
    if (!picked) return setError('Choose a time.')
    setPending(true)
    setError(null)
    try {
      await submit(picked)
    } catch (e) {
      const err = e as ApiError
      setError(err.message)
      if (err.code === 'SLOT_TAKEN') { setPicked(null); rows.reload() }
    } finally {
      setPending(false)
    }
  }

  const chip = (m: Mode, label: string) => <button type="button" className="chip" aria-pressed={mode === m} onClick={() => { setMode(m); setPicked(null) }}>{label}</button>

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="When">
        {chip('first', 'First available')}{chip('today', 'Today')}{chip('tomorrow', 'Tomorrow')}{chip('date', 'Pick a date')}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {mode === 'date' && <Field label="Date" type="date" value={date} min={lisbonDay()} max={addDays(lisbonDay(), 21)} onChange={(e) => { setDate(e.target.value || lisbonDay()); setPicked(null) }} />}
        <Field as="select" label="Language" value={language} onChange={(e) => { setLanguage(e.target.value); setPicked(null) }}>
          <option value="">Any language</option>
          {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
        </Field>
        <Field as="select" label="Consultation price" value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value); setPicked(null) }}>
          <option value="">Any price</option>
          {PRICE_CAPS.map((p) => <option key={p} value={p}>Up to €{p}</option>)}
        </Field>
      </div>

      <section className="mt-6 grid gap-3" aria-label="Doctors and times" aria-busy={rows.loading}>
        <p className="sr-only" aria-live="polite">{rows.loading ? 'Loading times' : `${sorted.length} doctors with times`}</p>
        {rows.error ? <ErrorState error={rows.error} onRetry={rows.reload} />
          : rows.loading && !rows.data ? <Loading label="Loading times" />
          : !sorted.length ? (
            <div className="card text-center">
              <h2 className="text-[22px]">No times {mode === 'first' ? 'in the next week' : dayLabel(`${day}T12:00:00Z`).replace(/^(?!Today|Tomorrow)/, 'on ').toLowerCase()}</h2>
              <p className="muted mt-2">Try another day{language && ', or any language'}{maxPrice && ', or any price'}.</p>
              {mode !== 'first' && <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={() => setMode('first')}>Show first available</button>}
            </div>
          ) : sorted.map((r) => (
            <article key={r.doctor.id} className="card card-tight">
              <div className="flex gap-4">
                <DoctorAvatar doctor={r.doctor} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <h2 className="font-sans text-[18px] font-medium">{r.doctor.name}{r.doctor.id === preferredDoctorId && <span className="badge ml-2 align-middle">{preferredLabel}</span>}</h2>
                    <span className="font-medium">{euro(r.doctor.fee)}</span>
                  </div>
                  <p className="fine">{r.doctor.specialty} · {r.doctor.languages}</p>
                  <p className="fine">Cédula {r.doctor.cedula} · <button type="button" className="link min-h-11" onClick={() => setProfile(r.doctor.id)}>View profile<span className="sr-only"> of {r.doctor.name}</span></button></p>
                </div>
              </div>
              {byDay(r.slots).map(([label, slots]) => (
                <div key={label} className="mt-3">
                  <p className="fine mb-2">{label}</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${label}, times with ${r.doctor.name}`}>
                    {slots.slice(0, 8).map((s) => (
                      <button key={String(s.id)} type="button" role="radio" aria-checked={picked?.id === s.id} className="chip" onClick={() => { setPicked({ id: s.id, startsAt: s.startsAt, doctor: r.doctor }); setError(null) }}>
                        {hhmm(s.startsAt)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </article>
          ))}
      </section>
      <FormError error={error} />
      <Actions back={back}>
        <button type="button" className="btn btn-primary" disabled={!picked || pending} onClick={go}>
          {pending ? pendingLabel : picked ? `${verb} ${dayLabel(picked.startsAt) === 'Today' ? '' : dayLabel(picked.startsAt) + ', '}${hhmm(picked.startsAt)}` : 'Choose a time'}
        </button>
      </Actions>
      <DoctorProfile id={profile} onClose={() => setProfile(null)} />
    </div>
  )
}

function byDay<T extends { startsAt: string }>(slots: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const s of slots) m.set(dayLabel(s.startsAt), [...(m.get(dayLabel(s.startsAt)) ?? []), s])
  return [...m]
}

function DoctorProfile({ id, onClose }: { id: number | null; onClose: () => void }) {
  const d = useLoad(() => (id === null ? Promise.resolve(null) : api.doctor(id).then((r) => r.doctor)), [id])
  return (
    <Dialog open={id !== null} onClose={onClose} title={d.data?.name ?? 'Doctor'}>
      {d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : !d.data ? <Loading lines={2} /> : (
        <dl className="summary">
          <dt>Specialty</dt><dd>{d.data.specialty}</dd>
          <dt>Languages</dt><dd>{d.data.languages}</dd>
          <dt>Registration</dt><dd>Ordem dos Médicos cédula {d.data.cedula}</dd>
          {d.data.experience && <><dt>Experience</dt><dd>{d.data.experience}</dd></>}
          {d.data.education && <><dt>Training <span className="badge ml-1">Illustrative</span></dt><dd>{d.data.education}</dd></>}
          {d.data.approach && <><dt>Approach</dt><dd>{d.data.approach}</dd></>}
          <dt>Fee</dt><dd>{euro(d.data.fee)} per video consultation</dd>
        </dl>
      )}
    </Dialog>
  )
}


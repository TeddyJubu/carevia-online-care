import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { nextStep, useDraft, type Draft } from '../lib/booking'
import { useLoad } from '../lib/load'
import { useSession } from '../lib/session'
import { addDays, age, birthDate, dayLabel, hhmm, lisbonDay, when } from '../lib/time'
import type { Appointment, Doctor, For, GroupSlug, ServiceGroup, SlotWithDoctor } from '../lib/types'
import { Dialog, DoctorAvatar, Emergency, ErrorState, euro, Field, FormError, HoldTimer, Loading, Markdown, Notice, PageTitle, Spinner } from '../ui/kit'
import { SignInForm, SignUpForm } from './auth'

// ---------- shared booking state ----------
type Ctx = {
  groups: ServiceGroup[]
  group?: ServiceGroup
  service?: { id: number; name: string }
  draft: Draft
  update: (p: Partial<Draft>) => void
  clear: () => void
  appt?: Appointment
  setAppt: (a: Appointment | undefined) => void
  /** After a hold exists and someone is signed in: claim it, set "self" if it's for them, go to the next step. */
  continueSignedIn: (a: Appointment) => Promise<void>
  /** Shows the "time released" dialog. */
  expire: () => void
}
const useBooking = () => useOutletContext<Ctx>()

const STEPS = [
  { label: 'Care', paths: ['/book'] },
  { label: 'Who and where', paths: ['/book/who'] },
  { label: 'Doctor and time', paths: ['/book/time'] },
  { label: 'Your details', paths: ['/book/account', '/book/family'] },
  { label: 'Consent', paths: ['/book/consent'] },
  { label: 'Review and pay', paths: ['/book/pay'] },
]
const FOR_LABEL: Record<For, string> = { self: 'Me', child: 'My child', adult: 'Another adult' }

export function BookingLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useSession()
  const [draft, update, clear] = useDraft()
  const services = useLoad(() => api.services(), [])
  const [appt, setAppt] = useState<Appointment>()
  const [expired, setExpired] = useState(false)

  // Resume a held appointment from this tab, if any.
  useEffect(() => {
    if (!draft.appointmentId || appt?.id === draft.appointmentId) return
    if (!user) return // a hold before sign-in can't be read yet; the summary uses the draft until then
    api.appointment(draft.appointmentId).then(({ appointment }) => {
      if (appointment.status === 'expired' || appointment.status === 'cancelled') { update({ appointmentId: undefined, held: undefined }); return }
      setAppt(appointment)
    }, () => {}) // a 404 here is normal just after sign-in, before the claim lands; never drop the hold on it
  }, [draft.appointmentId, user, appt?.id, update])

  const groups = services.data?.groups ?? []
  const group = groups.find((g) => g.slug === draft.groupSlug)
  const service = group?.services.find((s) => s.id === draft.serviceId)

  const continueSignedIn = useCallback(async (held: Appointment) => {
    let a: Appointment
    try {
      a = (await api.claim(held.id)).appointment
    } catch (e) {
      // Already paid (for example a second tab): go to the visit instead of booking again.
      if ((e as ApiError).code === 'NOT_HELD') return navigate(`/visits/${held.id}`)
      throw e
    }
    if ((a.for ?? draft.for) === 'self' && !a.patient) a = (await api.setPatient(a.id, null)).appointment
    setAppt(a)
    navigate(nextStep(a, true))
  }, [navigate, draft.for])

  const expire = useCallback(() => setExpired(true), [])
  const step = Math.max(0, STEPS.findIndex((s) => s.paths.includes(pathname.replace(/\/$/, ''))))

  if (services.error) return <div className="page"><ErrorState error={services.error} onRetry={services.reload} /></div>

  return (
    <div className="page">
      <div className="book-grid">
        <nav className="stepper hidden min-[1025px]:block" aria-label="Booking steps">
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.label} className={i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
                <span className="dot" aria-hidden="true">{i < step ? <Tick /> : i + 1}</span>
                <span>{s.label}{i < step && <span className="sr-only"> (done)</span>}</span>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0">
          <p className="eyebrow mb-3 min-[1025px]:hidden">Step {step + 1} of {STEPS.length} · {STEPS[step].label}</p>
          {step > 0 && (group || appt) && <MobileSummary {...{ group, service, draft, appt }} onExpire={expire} />}
          {services.loading && !services.data ? <Loading /> : (
            <Outlet context={{ groups, group, service, draft, update, clear, appt, setAppt, continueSignedIn, expire } satisfies Ctx} />
          )}
        </div>
        <aside className="book-aside hidden min-[1025px]:block" aria-label="Your visit">
          <Summary {...{ group, service, draft, appt }} onExpire={expire} />
        </aside>
      </div>
      <Dialog open={expired} onClose={() => setExpired(false)} title="Your time was released">
        <p>We hold a time for 10 minutes. That time has passed, so someone else may book it now. Your other choices are kept.</p>
        <button type="button" className="btn btn-primary mt-6" onClick={() => {
          setExpired(false)
          setAppt(undefined)
          update({ appointmentId: undefined, held: undefined })
          navigate('/book/time')
        }}>Choose a time again</button>
      </Dialog>
    </div>
  )
}

const Tick = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m2.5 6.2 2.3 2.3 4.7-5" /></svg>

type SumProps = { group?: ServiceGroup; service?: { name: string }; draft: Draft; appt?: Appointment; onExpire: () => void }

function SummaryBody({ group, service, draft, appt, onExpire }: SumProps) {
  const forText = appt?.patient?.kind === 'family' ? appt.patient.displayName : draft.for ? FOR_LABEL[draft.for] : null
  return (
    <>
      <dl className="summary">
        <dt>Care</dt>
        <dd><span className="font-medium">{appt?.service.groupName ?? group?.name ?? 'Not chosen yet'}</span>{(appt?.service.name ?? service?.name) && <><br />{appt?.service.name ?? service?.name}</>}</dd>
        <dt>Consultation</dt>
        <dd>Video, in your browser</dd>
        {forText && <><dt>For</dt><dd>{forText}{draft.inMainland && ' · Mainland Portugal'}</dd></>}
        {appt && <><dt>Doctor and time</dt><dd><span className="font-medium">{when(appt.startsAt)}</span><br />{appt.doctor.name}</dd></>}
      </dl>
      <hr className="rule" />
      <p className="mt-3 flex items-baseline justify-between">
        <span>{appt ? 'Total' : 'Price'}</span>
        <span className="text-[22px] font-medium">{appt ? euro(appt.fee) : group ? `From ${euro(group.fromFee)}` : '–'}</span>
      </p>
      {appt?.status === 'held' && appt.holdExpiresAt && (
        <p className="mt-3 flex items-center justify-between gap-3 fine">Held for you <HoldTimer expiresAt={appt.holdExpiresAt} onExpire={onExpire} /></p>
      )}
    </>
  )
}

function Summary(p: SumProps) {
  return (
    <div className="card">
      <p className="eyebrow mb-3">Your visit</p>
      <SummaryBody {...p} />
      {p.group && <Link to="/book" className="link mt-4 inline-flex min-h-11 items-center text-sm">Change care</Link>}
    </div>
  )
}

/** Phones: the same summary, folded into one line above the step. */
function MobileSummary(p: SumProps) {
  return (
    <details className="card card-tight mb-6 min-[1025px]:hidden">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="font-medium">{p.appt ? `${p.appt.service.groupName} · ${euro(p.appt.fee)}` : p.group ? `${p.group.name} · from ${euro(p.group.fromFee)}` : 'Your visit'}</span>
        {p.appt?.status === 'held' && p.appt.holdExpiresAt ? <HoldTimer expiresAt={p.appt.holdExpiresAt} /> : <span className="fine">Details</span>}
      </summary>
      <div className="mt-4"><SummaryBody {...p} /></div>
    </details>
  )
}

function Actions({ back, children }: { back?: string; children: ReactNode }) {
  return (
    <div className="mt-10 flex flex-wrap items-center gap-3 max-sm:sticky max-sm:bottom-0 max-sm:-mx-4 max-sm:border-t max-sm:border-[#102d5014] max-sm:bg-paper/95 max-sm:px-4 max-sm:py-3 max-sm:backdrop-blur">
      {back && <Link to={back} className="btn btn-secondary">Back</Link>}
      {children}
    </div>
  )
}

// ---------- J1: service and consultation type ----------
export function BookService() {
  const { groups, group, draft, update } = useBooking()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  // Deep link: /app/book?service=<group slug>, optionally &doctor=<id> for a follow-up.
  useEffect(() => {
    const slug = params.get('service') as GroupSlug | null
    const g = groups.find((x) => x.slug === slug)
    if (!g) return
    const doctor = params.get('doctor')
    if (g.slug !== draft.groupSlug || doctor) update({ groupSlug: g.slug, serviceId: g.services[0]?.id, doctorId: doctor ? Number(doctor) : undefined })
  }, [params, groups]) // eslint-disable-line react-hooks/exhaustive-deps

  const [type, setType] = useState<'video' | 'audio'>('video')
  const [error, setError] = useState<string | null>(null)

  // Two rows: areas of care, then the services in the chosen area. Doctors and prices are per area, so another area
  // starts on its first service and drops anything tied to the old one (a chosen doctor, a held time).
  const pickArea = (g: ServiceGroup) => {
    setError(null)
    if (g.slug !== draft.groupSlug) update({ groupSlug: g.slug, serviceId: g.services[0]?.id, doctorId: undefined, appointmentId: undefined, held: undefined })
  }
  // Long area rows scroll; bring the chosen area into view once, when the step opens.
  const areaRow = useRef<HTMLDivElement>(null)
  useEffect(() => {
    areaRow.current?.querySelector('label:has(input:checked)')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [Boolean(group)]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form noValidate onSubmit={(e) => {
      e.preventDefault()
      if (!group || !draft.serviceId) return setError('Choose the care you need.')
      navigate('/book/who')
    }}>
      <PageTitle eyebrow="Book a visit" lede={group ? group.blurb : 'Choose an area of care. You’ll see doctors, times and the price before you give any details.'}>
        {group ? group.name : 'What do you need help with?'}
      </PageTitle>
      <div className="mt-6"><Emergency compact /></div>

      {!group ? (
        <fieldset className="mt-8">
          <legend className="text-[20px] font-medium">Areas of care</legend>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <label key={g.id} className="choice">
                <input type="radio" name="group" value={g.slug} onChange={() => { update({ groupSlug: g.slug, serviceId: g.services[0]?.id }); setError(null) }} />
                <span><span className="block font-medium">{g.name}</span><span className="fine block">{g.blurb}</span><span className="fine block mt-1">From {euro(g.fromFee)}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          {/* min-w-0: a fieldset otherwise grows to its widest row and the whole page scrolls sideways. */}
          <fieldset className="mt-8 min-w-0">
            <legend className="text-[20px] font-medium">Which fits best?</legend>
            <p className="fine mt-1">Choose an area, then the closest match. Not sure? Your doctor will guide you.</p>
            {/* These services are named after documents; booking one must not read as a promise of it (PLAN.md). */}
            {(group.slug === 'certificates' || group.slug === 'renewals') && (
              <Notice className="mt-3"><span>Your doctor decides, after assessing you, whether anything needs to be issued. Booking a visit doesn’t guarantee a certificate, a test request or a renewal. Anything issued comes through iMED.</span></Notice>
            )}
            <div role="radiogroup" aria-labelledby="area-label" className="mt-5">
              <p id="area-label" className="text-sm font-medium">Area of care</p>
              <div ref={areaRow} className="service-row mt-2">
                {groups.map((g) => (
                  <label key={g.id} className="choice service-pill">
                    <input type="radio" name="area" checked={g.slug === group.slug} onChange={() => pickArea(g)} />
                    <span>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div role="radiogroup" aria-labelledby="service-label" className="mt-5">
              <p id="service-label" className="text-sm font-medium">{group.name}<span className="fine font-normal"> · from {euro(group.fromFee)}</span></p>
              {/* key: a new area replaces the row, so its pills animate in. */}
              <div key={group.slug} className="service-row service-row-in mt-2">
                {group.services.map((s, i) => (
                  <label key={s.id} className="choice service-pill" style={{ animationDelay: `${i * 35}ms` }}>
                    <input type="radio" name="service" checked={draft.serviceId === s.id} onChange={() => { setError(null); update({ serviceId: s.id }) }} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset className="mt-8">
            <legend className="text-[20px] font-medium">How would you like to talk?</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="choice">
                <input type="radio" name="type" checked={type === 'video'} onChange={() => setType('video')} />
                <span><span className="block font-medium">Video consultation</span><span className="fine block">In your browser. No app to install.</span></span>
              </label>
              <label className="choice">
                <input type="radio" name="type" disabled checked={type === 'audio'} onChange={() => setType('audio')} aria-describedby="audio-later" />
                <span><span className="block font-medium">Phone call</span><span id="audio-later" className="fine block">Coming later. Not available yet.</span></span>
              </label>
            </div>
          </fieldset>
        </>
      )}
      <FormError error={error} />
      <Actions><button className="btn btn-primary" disabled={!group}>Continue</button></Actions>
    </form>
  )
}

// ---------- J2: who and where ----------
export function BookWho() {
  const { group, draft, update, appt, setAppt } = useBooking()
  const navigate = useNavigate()
  const [who, setWho] = useState<For | undefined>(draft.for)
  const [where, setWhere] = useState<'yes' | 'no' | undefined>(draft.inMainland === undefined ? undefined : draft.inMainland ? 'yes' : 'no')
  const [errors, setErrors] = useState<{ who?: string; where?: string }>({})
  if (!group) return <NeedCare />

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = { who: who ? undefined : 'Choose who this visit is for.', where: where ? undefined : 'Tell us where you’ll be.' }
    setErrors(errs)
    if (!who || where !== 'yes') return
    // A hold is made for one person; changing who it's for means choosing the time again.
    if (appt && appt.for && appt.for !== who) { void api.release(appt.id).catch(() => {}); setAppt(undefined); update({ appointmentId: undefined, held: undefined }) }
    update({ for: who, inMainland: true })
    navigate('/book/time')
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <PageTitle eyebrow={group.name}>Who and where</PageTitle>
      <div className="mt-6"><Emergency /></div>
      <fieldset className="mt-8" aria-describedby={errors.who ? 'who-err' : undefined}>
        <legend className="text-[22px] font-serif">Who is this visit for?</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {([['self', 'Me', 'Aged 18 or over'], ['child', 'My child', 'You book as parent or guardian'], ['adult', 'Another adult', 'Someone you care for']] as const).map(([v, t, d]) => (
            <label key={v} className="choice">
              <input type="radio" name="who" value={v} checked={who === v} onChange={() => setWho(v)} />
              <span><span className="block font-medium">{t}</span><span className="fine block">{d}</span></span>
            </label>
          ))}
        </div>
        <p id="who-err" className="field-error mt-2" aria-live="polite">{errors.who}</p>
      </fieldset>
      <fieldset className="mt-6" aria-describedby={`where-hint${errors.where ? ' where-err' : ''}`}>
        <legend className="text-[22px] font-serif">Will you be in mainland Portugal during the visit?</legend>
        <p id="where-hint" className="fine mt-1">Our doctors can only see patients who are in mainland Portugal at the time of the visit. Madeira and the Azores aren’t covered yet.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="choice"><input type="radio" name="where" checked={where === 'yes'} onChange={() => setWhere('yes')} /><span className="font-medium">Yes, I’ll be in mainland Portugal</span></label>
          <label className="choice"><input type="radio" name="where" checked={where === 'no'} onChange={() => setWhere('no')} /><span className="font-medium">No, I’ll be somewhere else</span></label>
        </div>
        <p id="where-err" className="field-error mt-2" aria-live="polite">{errors.where}</p>
      </fieldset>
      <div aria-live="polite">
        {where === 'no' && (
          <Notice tone="warn" className="mt-4">
            <span>Carevia can only see patients who are in mainland Portugal during the visit. If you’ll be back before you need care, choose a time after you return. For urgent help where you are, call the local emergency number (112 across the EU).</span>
          </Notice>
        )}
      </div>
      <Actions back="/book"><button className="btn btn-primary" disabled={where === 'no'}>Continue</button></Actions>
    </form>
  )
}

/** J4b to J6 without a hold, for example Back after paying: say so instead of loading for ever. */
function NoBooking({ pending }: { pending: boolean }) {
  if (pending) return <Spinner label="Loading your booking…" />
  return (
    <div>
      <PageTitle lede="If you’ve just paid, your visit is in your account.">No booking in progress</PageTitle>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/account" className="btn btn-primary">Go to your visits</Link>
        <Link to="/book" className="btn btn-secondary">Book a visit</Link>
      </div>
    </div>
  )
}

function NeedCare() {
  return (
    <div>
      <PageTitle lede="Start by choosing the care you need.">Let’s start with your care</PageTitle>
      <Link to="/book" className="btn btn-primary mt-8">Choose care</Link>
    </div>
  )
}

// ---------- J3: doctor and time ----------
type Mode = 'first' | 'today' | 'tomorrow' | 'date'
const LANGUAGES = ['English', 'Portuguese', 'French', 'German', 'Spanish', 'Italian']
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

  // A follow-up's doctor goes first.
  const sorted = useMemo(() => {
    const list = rows.data ?? []
    return preferredDoctorId === undefined ? list : [...list].sort((a, b) => Number(b.doctor.id === preferredDoctorId) - Number(a.doctor.id === preferredDoctorId))
  }, [rows.data, preferredDoctorId])

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
      </div>

      <section className="mt-6 grid gap-3" aria-label="Doctors and times" aria-busy={rows.loading}>
        <p className="sr-only" aria-live="polite">{rows.loading ? 'Loading times' : `${sorted.length} doctors with times`}</p>
        {rows.error ? <ErrorState error={rows.error} onRetry={rows.reload} />
          : rows.loading && !rows.data ? <Loading label="Loading times" />
          : !sorted.length ? (
            <div className="card text-center">
              <h2 className="text-[22px]">No times {mode === 'first' ? 'in the next week' : dayLabel(`${day}T12:00:00Z`).replace(/^(?!Today|Tomorrow)/, 'on ').toLowerCase()}</h2>
              <p className="muted mt-2">Try another day{language && ', or any language'}.</p>
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

export function BookTime() {
  const { group, service, draft, update, setAppt, continueSignedIn } = useBooking()
  const { user } = useSession()
  const navigate = useNavigate()
  if (!group || !service) return <NeedCare />
  if (!draft.for || !draft.inMainland) return <div><PageTitle lede="Tell us who the visit is for and where you’ll be first.">One step first</PageTitle><Link to="/book/who" className="btn btn-primary mt-8">Who and where</Link></div>
  return (
    <div>
      <PageTitle eyebrow={`${group.name} · ${service.name}`} lede="Pick a doctor and a time. We’ll hold it for 10 minutes while you finish.">Doctor and time</PageTitle>
      <TimePicker groupSlug={group.slug} service={service} preferredDoctorId={draft.doctorId} back="/book/who" verb="Continue with" pendingLabel="Holding your time…"
        submit={async (picked) => {
          const { appointment } = await api.hold({ slotId: picked.id, serviceId: service.id, for: draft.for! })
          const { id, startsAt, holdExpiresAt, fee, status, doctor } = appointment
          update({ appointmentId: id, held: { id, startsAt, holdExpiresAt, fee, status, doctor: { name: doctor.name } } })
          setAppt(appointment)
          if (user?.role === 'patient') await continueSignedIn(appointment)
          else navigate('/book/account')
        }} />
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

// ---------- J4: account, then claim the hold ----------
export function BookAccount() {
  const { appt, draft, continueSignedIn, expire } = useBooking()
  const { user } = useSession()
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = appt?.id ?? draft.appointmentId
  const held = appt ?? (draft.held?.id === id ? draft.held : undefined)

  const go = useCallback(async () => {
    if (!id) return
    setBusy(true)
    setError(null)
    try {
      await continueSignedIn(appt ?? ({ id } as Appointment))
    } catch (e) {
      const err = e as ApiError
      if (err.code === 'HOLD_EXPIRED') expire()
      else setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [id, appt, continueSignedIn, expire])

  // Already signed in (or just signed in): claim straight away.
  useEffect(() => { if (user?.role === 'patient' && id && !error) void go() }, [user?.role, id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!id) return <div><PageTitle lede="Choose a doctor and time first. We’ll hold it while you create your account.">Choose a time first</PageTitle><Link to="/book/time" className="btn btn-primary mt-8">Doctor and time</Link></div>
  if (user && user.role !== 'patient') return <div><PageTitle lede="Doctor and admin accounts can’t book visits. Sign out, then book as a patient.">This account can’t book</PageTitle></div>
  if (user) return <div className="py-10">{error ? <ErrorState error={{ message: error }} onRetry={go} title="We couldn’t keep your time" /> : <Spinner label={busy ? 'Keeping your time for you…' : 'One moment…'} />}</div>

  return (
    <div>
      <PageTitle eyebrow="Your details" lede="You’ll use this account to join the visit and see what happens next.">{mode === 'signup' ? 'Create your account' : 'Sign in'}</PageTitle>
      {held?.holdExpiresAt && (
        <Notice className="mt-6"><span>We’re holding <strong className="font-medium">{when(held.startsAt)}</strong> with {held.doctor.name} for you. <HoldTimer expiresAt={held.holdExpiresAt} onExpire={expire} /></span></Notice>
      )}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="card">{mode === 'signup' ? <SignUpForm onDone={() => {}} submitLabel="Create account and continue" /> : <SignInForm onDone={() => {}} submitLabel="Sign in and continue" />}</div>
        <div className="grid content-start gap-3">
          <div className="card card-tight">
            <h2 className="font-sans text-[17px] font-medium">{mode === 'signup' ? 'Already have an account?' : 'New to Carevia?'}</h2>
            <p className="fine mt-1">{mode === 'signup' ? 'Sign in and we’ll keep your time.' : 'Create an account. We’ll keep your time.'}</p>
            <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>{mode === 'signup' ? 'Sign in instead' : 'Create an account'}</button>
          </div>
          {draft.for && draft.for !== 'self' && (
            <div className="card card-tight border-dashed">
              <h2 className="font-sans text-[17px] font-medium">Booking for {draft.for === 'child' ? 'your child' : 'someone you care for'}?</h2>
              <p className="fine mt-1">Create the account in your own name. You’ll add their details next. They’ll appear under Family.</p>
            </div>
          )}
        </div>
      </div>
      <FormError error={error} />
    </div>
  )
}

// ---------- J4b: family member ----------
export function BookFamily() {
  const { appt, draft, setAppt, expire } = useBooking()
  const navigate = useNavigate()
  const kind = (appt?.for ?? draft.for) as For | undefined
  const family = useLoad(() => api.family(), [])
  const [choice, setChoice] = useState<string | 'new' | ''>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const members = (family.data?.members ?? []).filter((m) => m.relationship === kind)
  useEffect(() => { if (family.data && !choice) setChoice(members[0]?.id ?? 'new') }, [family.data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!appt) return <NoBooking pending={!!draft.appointmentId} />
  if (kind === 'self') return <div><PageTitle>This visit is for you</PageTitle><Link to="/book/consent" className="btn btn-primary mt-8">Continue</Link></div>
  const child = kind === 'child'

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    let memberId = choice
    if (choice === 'new') {
      const f = new FormData(e.currentTarget)
      const m = { firstName: String(f.get('firstName') ?? '').trim(), lastName: String(f.get('lastName') ?? '').trim(), dateOfBirth: String(f.get('dateOfBirth') ?? ''), relationship: kind! as 'child' | 'adult' }
      const errs: Record<string, string> = {}
      if (!m.firstName) errs.firstName = 'Enter their first name.'
      if (!m.lastName) errs.lastName = 'Enter their last name.'
      if (!m.dateOfBirth) errs.dateOfBirth = 'Enter their date of birth.'
      else if (child && age(m.dateOfBirth) >= 18) errs.dateOfBirth = 'A child must be under 18. Go back and choose “Another adult” instead.'
      else if (!child && age(m.dateOfBirth) < 18) errs.dateOfBirth = 'This person is under 18. Go back and choose “My child” instead.'
      setErrors(errs)
      if (Object.keys(errs).length) return
      setPending(true)
      try { memberId = (await api.addFamily(m)).member.id } catch (err) { setError((err as ApiError).message); setPending(false); return }
    } else if (!choice) {
      return setError(child ? 'Choose your child.' : 'Choose who the visit is for.')
    }
    setPending(true)
    try {
      setAppt((await api.setPatient(appt!.id, memberId)).appointment)
      navigate('/book/consent')
    } catch (err) {
      if ((err as ApiError).code === 'HOLD_EXPIRED') expire()
      setError((err as ApiError).message)
    } finally { setPending(false) }
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <PageTitle eyebrow="Your details" lede={child ? 'You book as their parent or guardian, and you’ll join the visit with them.' : 'You book for them. They should be with you, or able to join, at the visit.'}>
        {child ? 'Which child is this for?' : 'Who is this visit for?'}
      </PageTitle>
      {family.error ? <div className="mt-6"><ErrorState error={family.error} onRetry={family.reload} /></div> : family.loading ? <div className="mt-6"><Loading lines={2} /></div> : (
        <fieldset className="mt-8">
          <legend className="sr-only">{child ? 'Your children' : 'People you care for'}</legend>
          <div className="grid gap-3">
            {members.map((m) => (
              <label key={m.id} className="choice">
                <input type="radio" name="member" checked={choice === m.id} onChange={() => setChoice(m.id)} />
                <span><span className="block font-medium">{m.firstName} {m.lastName}</span><span className="fine block">Born {birthDate(m.dateOfBirth)}</span></span>
              </label>
            ))}
            <label className="choice">
              <input type="radio" name="member" checked={choice === 'new'} onChange={() => setChoice('new')} />
              <span className="font-medium">{members.length ? 'Someone else' : child ? 'Add your child' : 'Add the person you care for'}</span>
            </label>
          </div>
          {choice === 'new' && (
            <div className="card mt-4 grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="First name" name="firstName" autoComplete="off" error={errors.firstName} />
                <Field label="Last name" name="lastName" autoComplete="off" error={errors.lastName} />
              </div>
              <Field label="Date of birth" name="dateOfBirth" type="date" max={lisbonDay()} error={errors.dateOfBirth} />
              <p className="fine">We only ask for what the doctor needs to know who they’re seeing. They’ll be saved under Family in your account.</p>
            </div>
          )}
        </fieldset>
      )}
      <FormError error={error} />
      <Actions back="/book/who"><button className="btn btn-primary" disabled={pending || family.loading}>{pending ? 'Saving…' : 'Continue'}</button></Actions>
    </form>
  )
}

// ---------- J5: consent ----------
export function BookConsent() {
  const { appt, draft, setAppt, expire } = useBooking()
  const navigate = useNavigate()
  const consent = useLoad(() => api.consent(), [])
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  if (!appt) return <NoBooking pending={!!draft.appointmentId} />
  if (!appt.patient) return <div><PageTitle>Who is this visit for?</PageTitle><Link to={nextStep(appt, true)} className="btn btn-primary mt-8">Continue</Link></div>

  async function accept(e: FormEvent) {
    e.preventDefault()
    if (!agreed) return setError('Please tick the box to agree before you continue.')
    setPending(true)
    setError(null)
    try {
      setAppt((await api.acceptConsent(appt!.id, consent.data!.version)).appointment)
      navigate('/book/pay')
    } catch (err) {
      const e2 = err as ApiError
      if (e2.code === 'HOLD_EXPIRED') expire()
      if (e2.code === 'CONSENT_OUTDATED') { setAgreed(false); consent.reload() }
      setError(e2.message)
    } finally { setPending(false) }
  }

  return (
    <form noValidate onSubmit={accept}>
      <PageTitle eyebrow="Consent">{consent.data?.title ?? 'How your visit works'}</PageTitle>
      {consent.error ? <div className="mt-6"><ErrorState error={consent.error} onRetry={consent.reload} /></div> : !consent.data ? <div className="mt-6"><Loading /></div> : (
        <>
          <div className="card mt-8 max-h-[min(60svh,560px)] overflow-auto" tabIndex={0} role="region" aria-label="Consultation terms">
            <Markdown source={consent.data.body} headingLevel={2} />
            <p className="fine mt-4">Version {consent.data.version}</p>
          </div>
          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="card card-tight"><dt className="fine">Price</dt><dd className="m-0 font-medium">{euro(appt.fee)} for this visit</dd></div>
            <div className="card card-tight"><dt className="fine">Recording</dt><dd className="m-0 font-medium">Off. Visits are not recorded.</dd></div>
            <div className="card card-tight"><dt className="fine">Emergencies</dt><dd className="m-0 font-medium">Call <a href="tel:112" className="link">112</a></dd></div>
          </dl>
          <label className="check mt-6 card card-tight">
            <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setError(null) }} aria-describedby={error ? 'consent-err' : undefined} />
            <span>I’ve read this. I agree to a video consultation on these terms{appt.patient.kind === 'family' ? `, on behalf of ${appt.patient.displayName}` : ''}.</span>
          </label>
        </>
      )}
      <div id="consent-err"><FormError error={error} /></div>
      <Actions back={appt.for && appt.for !== 'self' ? '/book/family' : '/book/time'}><button className="btn btn-primary" disabled={pending || !consent.data}>{pending ? 'Saving…' : 'Agree and continue'}</button></Actions>
    </form>
  )
}

// ---------- J6: review and demo payment ----------
export function BookPay() {
  const { appt, draft, clear, expire } = useBooking()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  if (!appt) return <NoBooking pending={!!draft.appointmentId} />
  if (!appt.consent || !appt.patient) return <div><PageTitle>A step is missing</PageTitle><Link to={nextStep(appt, true)} className="btn btn-primary mt-8">Continue</Link></div>

  async function pay() {
    setPending(true)
    setError(null)
    try {
      const { appointment } = await api.pay(appt!.id)
      clear()
      navigate(`/visits/${appointment.id}?booked=1`)
    } catch (e) {
      const err = e as ApiError
      if (err.code === 'HOLD_EXPIRED') expire()
      setError(err.code === 'PAYMENT_UNAVAILABLE' ? 'Payment isn’t available yet. Nothing has been charged. Please try again later.' : err.message)
      setPending(false)
    }
  }

  const row = (label: string, value: ReactNode, edit?: string) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="muted">{label}</dt>
      <dd className="m-0 text-right">{value}{edit && <> · <Link to={edit} className="link inline-flex min-h-11 items-center">Edit<span className="sr-only"> {label.toLowerCase()}</span></Link></>}</dd>
    </div>
  )
  return (
    <div>
      <PageTitle eyebrow="Review and pay">Check your visit</PageTitle>
      <dl className="card card-tight mt-8 rows">
        {row('Care', <span className="font-medium">{appt.service.groupName} · {appt.service.name}</span>, '/book')}
        {row('Doctor and time', <span className="font-medium">{appt.doctor.name}, {when(appt.startsAt)}</span>, '/book/time')}
        {row('For', <span className="font-medium">{appt.patient.kind === 'self' ? 'Me' : appt.patient.displayName}</span>, appt.patient.kind === 'family' ? '/book/family' : undefined)}
        {row('Consultation', 'Video, in your browser')}
        {row('Total', <span className="text-[20px] font-medium">{euro(appt.fee)}</span>)}
      </dl>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ul className="card card-mist grid gap-2 text-[15px]" aria-label="Good to know">
          <li>Pay per visit. No subscription.</li>
          <li>If the video fails, reconnect, then reschedule if needed. Same appointment.</li>
          <li>Price for patients in mainland Portugal. No other charges.</li>
        </ul>
        <div className="card card-tight">
          <p className="font-medium">Demo payment</p>
          <p className="fine mt-1">This is a demonstration. No card is needed and no money is taken.</p>
        </div>
      </div>
      <FormError error={error} />
      <Actions back="/book/consent">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={pay}>{pending ? 'Confirming…' : `Pay ${euro(appt.fee)} (demo)`}</button>
      </Actions>
    </div>
  )
}

import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { content } from '../lib/content'
import { useLoad, useNow } from '../lib/load'
import { useSession } from '../lib/session'
import { age, birthDate, dayMonth, fullDate, hhmm, lisbonDay, longDate, minutes, relDay, shortDate, TZ } from '../lib/time'
import type { Appointment, FamilyMember } from '../lib/types'
import { Dialog, Empty, ErrorState, euro, euroCents, Field, FormError, Loading, Markdown, Notice, PageTitle, paymentStatus, Still } from '../ui/kit'
import { toE164 } from './auth'
import { setBookFor } from './book'
import { checkInSteps, phaseOf } from './visit'

type Errors = Record<string, string>
const val = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')

const icon = (d: ReactNode) => <svg className="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
const NAV = [
  { to: '/account', label: 'Home', end: true, icon: icon(<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" />) },
  { to: '/appointments', label: 'Appointments', icon: icon(<><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>) },
  { to: '/book', label: 'Services', icon: icon(<><path d="M6 3.5v5a4 4 0 0 0 8 0v-5" /><path d="M10 12.5v2.5a5 5 0 0 0 10 0v-1.5" /><circle cx="20" cy="11.5" r="2" /></>) },
  { to: '/account/family', label: 'Family', icon: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16.5 5a3 3 0 0 1 0 6M18 14.6c1.9.5 3.2 2 3.6 4.4" /></>) },
  { to: '/account/payments', label: 'Payments', icon: icon(<><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18" /></>) },
  { to: '/account/profile', label: 'Profile', icon: icon(<><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5" /></>) },
  { to: '/account/security', label: 'Security', icon: icon(<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z" />) },
]

// A left rail on desktop (menu, then everyone on the account), a compact scrollable row on phones.
// No "Documents": those live in iMED.
export function AccountLayout() {
  const { user } = useSession()
  const { pathname } = useLocation()
  // Reloaded on each account page, so a change on Family shows here when you come back.
  const family = useLoad(() => api.family(), [pathname])
  return (
    <div className="page">
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0 lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start">
          <nav aria-label="Your account" className="side-nav">
            <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:px-0">
              {NAV.map((n) => (
                <li key={n.to} className="flex-none">
                  <NavLink to={n.to} end={n.end} className="whitespace-nowrap">{n.icon}{n.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <section aria-labelledby="manifest-title" className="manifest max-lg:hidden">
            <h2 id="manifest-title" className="k">On this account</h2>
            <ul className="mt-3.5 grid gap-3.5">
              <li className="flex items-center gap-2.5">
                <span className="initial" aria-hidden="true">{user?.firstName.charAt(0)}</span>
                <span><span className="block text-[14px] font-medium leading-tight">You</span><span className="block text-[12px] text-muted">Account holder</span></span>
              </li>
              {family.data?.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <span className="initial initial-warm" aria-hidden="true">{m.firstName.charAt(0)}</span>
                  <span className="min-w-0"><span className="block truncate text-[14px] font-medium leading-tight">{m.firstName} {m.lastName}</span><span className="block text-[12px] text-muted">{m.relationship === 'child' ? 'Child' : 'Adult you care for'}</span></span>
                </li>
              ))}
            </ul>
            <Link to="/account/family" className="mt-1 inline-flex min-h-11 items-center text-[13px] font-medium hover:underline">Manage family</Link>
          </section>
        </div>
        <div className="min-w-0 in-rail">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

/** Booking and visit pages are also public: a signed-in patient sees them inside the account rail, anyone else without it. */
export function PatientRail() {
  const { user } = useSession()
  return user?.role === 'patient' ? <AccountLayout /> : <Outlet />
}

// ---------- Home: the next visit as a boarding pass, its progress, and the care board ----------

const plus = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
const camera = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="6.5" width="13" height="11" rx="2" /><path d="m15.5 10.5 6-3.5v10l-6-3.5" /></svg>
const tick = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>

/** No booking number exists in the API; the visit id is already in every visit link, so its tail stands in. */
const bookingRef = (a: Appointment) => `CV-${a.id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}`
const forName = (a: Appointment) => (a.patient?.kind === 'family' ? a.patient.displayName.split(' ')[0] : 'You')
const joinTo = (a: Appointment) => (a.preJoin?.confirmedAt ? `/visits/${a.id}/waiting` : `/visits/${a.id}/join`)

/** "2h 40m", "3d 4h" or "12m" until an instant, rounded up so it never reads 0 before it opens. */
function opensIn(iso: string, now: number): string {
  const m = Math.max(1, Math.ceil((Date.parse(iso) - now) / 60000))
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

function BoardingPass({ a, now }: { a: Appointment; now: number }) {
  const phase = phaseOf(a, now)
  const steps = checkInSteps(a)
  const done = steps.filter(Boolean).length
  return (
    <section className="bp" aria-labelledby="bp-title">
      <div className="bp-body">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 id="bp-title" className="k flex items-center gap-2 text-accent"><span className="live-dot" aria-hidden="true" />{relDay(a.startsAt, new Date(now))} · Video consultation</h2>
          <p className="k">Booking {bookingRef(a)}</p>
        </div>
        <div className="bp-route">
          <div><p className="k">Patient</p><p className="bp-name">{a.patient?.kind === 'family' ? a.patient.displayName : 'You'}</p></div>
          <div className="bp-line" aria-hidden="true"><span className="bp-mode">{camera}Video</span></div>
          <div className="sm:text-right"><p className="k">Clinician</p><p className="bp-name">{a.doctor.name}</p></div>
        </div>
        <div className="bp-fields">
          <dl><dt className="k">Appointment</dt><dd className="bp-time">{hhmm(a.startsAt)}</dd></dl>
          <dl className="bp-facts">
            <div><dt className="k">Date</dt><dd>{shortDate(a.startsAt)}</dd></div>
            <div><dt className="k">Service</dt><dd>{a.service.name}</dd></div>
            <div><dt className="k">Join opens</dt><dd>{hhmm(a.call.joinOpensAt)}</dd></div>
          </dl>
        </div>
      </div>
      <div className="bp-perf" aria-hidden="true" />
      <div className="bp-stub on-navy">
        {phase === 'before' ? (
          <div>
            <p className="k">Join opens in</p>
            {/* Static text: it changes once a minute, too often to announce. The status line below speaks when it opens. */}
            <p className="bp-count">{opensIn(a.call.joinOpensAt, now)}</p>
            <p className="text-[13px] text-white/70">Waiting room opens 10 min before</p>
          </div>
        ) : (
          <div>
            <p className="k">Waiting room</p>
            <p className="bp-count">Open</p>
            <p className="text-[13px] text-white/70">Join until {hhmm(a.call.joinClosesAt)}</p>
          </div>
        )}
        <p role="status" className="sr-only">{phase === 'open' ? 'The waiting room for your next visit is open.' : ''}</p>
        <div className="grid gap-3">
          <Link to={joinTo(a)} className="btn btn-block bp-cta">{phase === 'open' && a.preJoin?.confirmedAt ? 'Enter the waiting room' : 'Check in now'}</Link>
          <p className="text-[12px] text-white/70">{done} of 3 check-in steps done · <Link to={`/visits/${a.id}`} className="link">See steps</Link></p>
        </div>
      </div>
    </section>
  )
}

function EmptyPass() {
  return (
    <section className="bp" aria-labelledby="bp-title">
      <div className="bp-body justify-center">
        <p className="k">Next visit</p>
        <h2 id="bp-title" className="bp-name mt-2">No visit booked</h2>
        <p className="muted mt-2 max-w-[44ch]">When you book, your visit’s time, doctor and check-in appear here, ready for the day.</p>
      </div>
      <div className="bp-perf" aria-hidden="true" />
      <div className="bp-stub on-navy justify-center gap-4">
        <p className="text-[15px] text-white/80">Online video visits with doctors in mainland Portugal.</p>
        <Link to="/book" className="btn btn-block bp-cta">{plus}Book new care</Link>
      </div>
    </section>
  )
}

/** Booked > Check in > Waiting room > Visit > Summary for the next visit. Summary is Carevia's visit status page. */
function Progress({ a, now }: { a: Appointment; now: number }) {
  const phase = phaseOf(a, now)
  const left = checkInSteps(a).filter((s) => !s).length
  const current = a.call.state === 'in_progress' ? 3 : phase === 'open' ? (a.preJoin?.confirmedAt ? 2 : 1) : left ? 1 : 2
  const steps: [string, string][] = [
    ['Booked', a.payment ? shortDate(a.payment.paidAt) : 'Paid'],
    ['Check in', current > 1 ? 'Done' : `Now · ${left} step${left === 1 ? '' : 's'} left`],
    ['Waiting room', `From ${hhmm(a.call.joinOpensAt)}`],
    ['Visit', `${hhmm(a.startsAt)} · ~${minutes(a.startsAt, a.endsAt)} min`],
    ['Summary', 'After the visit'],
  ]
  return (
    <ol className="progress" aria-label="Your next visit, step by step">
      {steps.map(([label, sub], i) => (
        <li key={label} className={i < current ? 'is-done' : i === current ? 'is-now' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="progress-dot" aria-hidden="true">{i < current ? tick : null}</span>
          <span className="block text-[14px] font-medium">{label}{i < current && <span className="sr-only"> (done)</span>}</span>
          <span className="block text-[12px] text-muted">{sub}</span>
        </li>
      ))}
    </ol>
  )
}

type Row = { status: string; tone: string; sub: string; action?: { to: string; label: string; pill?: boolean } }

function upcomingRow(a: Appointment, now: number): Row {
  const phase = phaseOf(a, now)
  const today = lisbonDay(a.startsAt) === lisbonDay(new Date(now))
  const sub = `${relDay(a.startsAt, new Date(now))} · ${hhmm(a.startsAt)} · Video`
  if (phase === 'open') return { status: 'Waiting room open', tone: 'live', sub, action: { to: joinTo(a), label: 'Check in', pill: true } }
  if (today) return { status: 'Check-in open', tone: 'live', sub, action: { to: joinTo(a), label: 'Check in', pill: true } }
  return { status: a.preJoin?.confirmedAt ? 'Checked in' : 'Scheduled', tone: '', sub, action: { to: `/visits/${a.id}`, label: 'Prepare' } }
}

const PAST: Record<string, [string, string]> = {
  completed: ['Completed', 'ok'], needs_in_person: ['In-person advised', 'warm'], no_show: ['Missed', 'warm'], ended_poor_quality: ['Call ended early', 'warm'],
}
function pastRow(a: Appointment): Row {
  if (a.status === 'cancelled') return { status: 'Cancelled', tone: 'off', sub: 'Cancelled' }
  const [status, tone] = PAST[a.outcome ?? (a.status === 'completed' ? 'completed' : '')] ?? ['Visit ended', '']
  return { status, tone, sub: 'Video visit', action: { to: `/visits/${a.id}/done`, label: 'Summary' } }
}

function BoardRow({ a, r, i }: { a: Appointment; r: Row; i: number }) {
  const [d, m] = dayMonth(a.startsAt)
  return (
    <tr>
      <td><span className="flap" style={{ '--d': `${i * 40}ms` } as CSSProperties}><span className="sr-only">{fullDate(a.startsAt)}</span>{[...d].map((c, k) => <b key={k} aria-hidden="true">{c}</b>)}<i aria-hidden="true" />{[...m].map((c, k) => <b key={k} className="flap-m" aria-hidden="true">{c}</b>)}</span></td>
      <td><span className="block font-medium text-white">{a.service.name}</span><span className="block text-[13px] text-white/60">{r.sub}</span></td>
      <td><span className="cb-k" aria-hidden="true">With </span>{a.doctor.name}</td>
      <td><span className="cb-k" aria-hidden="true">For </span>{forName(a)}</td>
      <td><span className={`cb-status ${r.tone}`}>{r.status}</span></td>
      <td className="cb-act">
        {r.action
          ? <Link to={r.action.to} className={r.action.pill ? 'cb-pill' : 'cb-link'}>{r.action.label}<span className="sr-only">, {a.service.name}, {fullDate(a.startsAt)}</span></Link>
          : <span className="text-white/40"><span aria-hidden="true">—</span><span className="sr-only">No action</span></span>}
      </td>
    </tr>
  )
}

const EARLIER = 5

function CareBoard({ upcoming, past, now }: { upcoming: Appointment[]; past: Appointment[]; now: number }) {
  const earlier = past.slice(0, EARLIER)
  return (
    <section aria-labelledby="board-title" className="mt-12">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id="board-title">Your care board</h2>
        <Link to="/appointments" className="inline-flex min-h-11 items-center text-[14px] font-medium hover:underline">All records</Link>
      </div>
      <div className="cb on-navy">
        <table>
          <caption className="sr-only">Your visits, upcoming and earlier</caption>
          <thead>
            <tr><th scope="col">Date</th><th scope="col">Visit</th><th scope="col">Clinician</th><th scope="col">For</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Action</span></th></tr>
          </thead>
          <tbody>
            <tr className="cb-sec"><th scope="colgroup" colSpan={6}>Upcoming</th></tr>
            {upcoming.length ? upcoming.map((a, i) => <BoardRow key={a.id} a={a} r={upcomingRow(a, now)} i={i} />)
              : <tr className="cb-none"><td colSpan={6}>Nothing booked. <Link to="/book" className="link">Book new care</Link></td></tr>}
          </tbody>
          {past.length > 0 && (
            <tbody id="board-earlier">
              <tr className="cb-sec"><th scope="colgroup" colSpan={6}>Earlier</th></tr>
              {earlier.map((a, i) => <BoardRow key={a.id} a={a} r={pastRow(a)} i={i + upcoming.length} />)}
            </tbody>
          )}
        </table>
      </div>
    </section>
  )
}

export function AccountHome() {
  const { user } = useSession()
  const [params, setParams] = useSearchParams()
  const now = useNow(60000)
  const upcoming = useLoad(() => api.appointments('upcoming'), [])
  const past = useLoad(() => api.appointments('past'), [])
  const verified = params.get('verified') === '1'
  const next = upcoming.data?.appointments[0]

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="k text-accent mb-2 text-[13px]">{longDate(new Date(now))}</p>
          <PageTitle title="Your account">Hello, {user?.firstName}</PageTitle>
        </div>
        <Link to="/book" className="btn btn-primary">{plus}Book new care</Link>
      </div>

      {verified && (
        <Notice tone="ok" className="mt-6 items-center justify-between">
          <span role="status">Your email is confirmed.</span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => { params.delete('verified'); setParams(params, { replace: true }) }}>Dismiss</button>
        </Notice>
      )}

      <div className="mt-7">
        {upcoming.loading && !upcoming.data ? <Loading label="Loading your visits" lines={3} />
          : upcoming.error ? <ErrorState error={upcoming.error} onRetry={upcoming.reload} title="We couldn’t load your visits" />
          : next ? <><BoardingPass a={next} now={now} /><Progress a={next} now={now} /></>
          : <EmptyPass />}
      </div>

      {upcoming.data && (past.error ? <div className="mt-12"><ErrorState error={past.error} onRetry={past.reload} title="We couldn’t load your past visits" /></div>
        : past.data ? <CareBoard upcoming={upcoming.data.appointments} past={past.data.appointments} now={now} />
        : <div className="mt-12"><Loading label="Loading past visits" lines={2} /></div>)}

    </>
  )
}

// ---------- Family ----------

type MemberInput = Omit<FamilyMember, 'id'>

const lock = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
const childIco = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="4.5" /><path d="M10.3 9.6h.01M13.7 9.6h.01M10.6 11.4c.8.6 2 .6 2.8 0M6 21c.9-3.2 3.2-5 6-5s5.1 1.8 6 5" /></svg>
const adultIco = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21c.9-4 3.6-6.5 7-6.5s6.1 2.5 7 6.5" /></svg>
const yearsOld = (dob: string) => { const n = age(dob); return n < 1 ? 'Under 1 year old' : `${n} year${n === 1 ? '' : 's'} old` }

function checkMember(b: Partial<MemberInput>): Errors {
  const e: Errors = {}
  if (!b.firstName) e.firstName = 'Enter their first name.'
  if (!b.lastName) e.lastName = 'Enter their last name.'
  if (!b.dateOfBirth) e.dateOfBirth = 'Enter their date of birth.'
  else if (b.dateOfBirth > lisbonDay()) e.dateOfBirth = 'The date of birth can’t be in the future.'
  else if (b.relationship === 'child' && age(b.dateOfBirth) >= 18) e.dateOfBirth = 'A child must be under 18. Add them as an adult you care for instead.'
  else if (b.relationship === 'adult' && age(b.dateOfBirth) < 18) e.dateOfBirth = 'An adult must be 18 or over. Add them as your child instead.'
  if (!b.relationship) e.relationship = 'Choose who they are to you.'
  return e
}

function MemberForm({ initial, submitLabel, onSave, onCancel }: { initial?: FamilyMember; submitLabel: string; onSave: (m: MemberInput) => Promise<void>; onCancel?: () => void }) {
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [rel, setRel] = useState<MemberInput['relationship']>(initial?.relationship ?? 'child')
  // Only asked when adding: the API has no field for it, so it's a check before the person is created.
  const askConfirm = !initial

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const b = { firstName: val(f, 'firstName'), lastName: val(f, 'lastName'), dateOfBirth: val(f, 'dateOfBirth'), relationship: val(f, 'relationship') as MemberInput['relationship'] }
    const errs = checkMember(b)
    if (askConfirm && !f.get('confirm')) errs.confirm = rel === 'child' ? 'Confirm you’re their parent or legal guardian.' : 'Confirm they’ve agreed to you booking for them.'
    setErrors(errs)
    setError(null)
    if (Object.keys(errs).length) {
      form.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus()
      return
    }
    setPending(true)
    try {
      await onSave(b)
      if (!initial) { form.reset(); setRel('child'); setErrors({}) }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-6">
      <fieldset className="grid gap-2.5">
        <legend className="field-label mb-2.5">Who are they to you?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="choice choice-rel">
            <input type="radio" name="relationship" value="child" checked={rel === 'child'} onChange={() => setRel('child')} aria-describedby={errors.relationship ? 'rel-err' : undefined} />
            <span className="min-w-0 flex-1"><span className="block font-medium">My child</span><span className="fine">Under 18. You book as parent or guardian.</span></span>
            <span className="ico-tile">{childIco}</span>
          </label>
          <label className="choice choice-rel">
            <input type="radio" name="relationship" value="adult" checked={rel === 'adult'} onChange={() => setRel('adult')} />
            <span className="min-w-0 flex-1"><span className="block font-medium">Another adult I care for</span><span className="fine">18 or over.</span></span>
            <span className="ico-tile">{adultIco}</span>
          </label>
        </div>
        <p id="rel-err" className="field-error" aria-live="polite">{errors.relationship}</p>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" name="firstName" autoComplete="off" placeholder="e.g. Leo" defaultValue={initial?.firstName} error={errors.firstName} />
        <Field label="Last name" name="lastName" autoComplete="off" placeholder="e.g. Silva" defaultValue={initial?.lastName} error={errors.lastName} />
      </div>
      <Field label="Date of birth" name="dateOfBirth" type="date" max={lisbonDay()} defaultValue={initial?.dateOfBirth} error={errors.dateOfBirth}
        hint="We use this to match them with a paediatric or adult doctor." />
      {askConfirm && (
        <div>
          <label className="check confirm-row">
            <input type="checkbox" name="confirm" aria-invalid={errors.confirm ? true : undefined} aria-describedby={errors.confirm ? 'confirm-err' : undefined} />
            <span>{rel === 'child' ? 'I confirm I’m their parent or legal guardian.' : 'I confirm they’ve agreed to me booking visits for them.'}</span>
          </label>
          {errors.confirm && <p id="confirm-err" className="field-error mt-2" role="alert">{errors.confirm}</p>}
        </div>
      )}
      <FormError error={error} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button className="btn btn-primary" disabled={pending}>{!initial && plus}{pending ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
        {!initial && <p className="fine">You can change these details at any time.</p>}
      </div>
    </form>
  )
}

export function FamilyPage() {
  const { user } = useSession()
  const navigate = useNavigate()
  const family = useLoad(() => api.family(), [])
  // Only to say whether each person has a visit coming up. Visits name the patient, not the member id.
  const upcoming = useLoad(() => api.appointments('upcoming'), [])
  const upcomingFor = (m: FamilyMember) => {
    if (!upcoming.data) return null
    const n = upcoming.data.appointments.filter((a) => a.patient?.kind === 'family' && a.patient.displayName === `${m.firstName} ${m.lastName}`).length
    return n === 0 ? 'No upcoming visits' : `${n} upcoming visit${n === 1 ? '' : 's'}`
  }
  const people = 1 + (family.data?.members.length ?? 0)
  const [editing, setEditing] = useState<FamilyMember | null>(null)
  const [removing, setRemoving] = useState<FamilyMember | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removePending, setRemovePending] = useState(false)
  const [status, setStatus] = useState('')

  async function remove() {
    if (!removing) return
    setRemovePending(true)
    setRemoveError(null)
    try {
      await api.removeFamily(removing.id)
      setStatus(`${removing.firstName} was removed.`)
      setRemoving(null)
      family.reload()
    } catch (e) {
      setRemoveError(errMsg(e))
    } finally {
      setRemovePending(false)
    }
  }

  return (
    <>
      <PageTitle title="Family" lede="Book visits for your children, or for an adult you care for, from your own account."
        eyebrow={<span className="k" style={{ color: 'var(--color-accent)', fontSize: 13 }}>Account{family.data ? ` · ${people} ${people === 1 ? 'person' : 'people'}` : ''}</span>}>Family</PageTitle>
      <p role="status" aria-live="polite" className="sr-only">{status}</p>

      <section aria-labelledby="members-title" className="mt-10">
        <h2 id="members-title" className="mb-3.5 font-serif text-[22px]">People on your account</h2>
        {family.loading && !family.data ? <Loading label="Loading your family" lines={2} />
          : family.error ? <ErrorState error={family.error} onRetry={family.reload} title="We couldn’t load your family" />
          : (
            <>
              <ul className="card rows p-0">
                <li className="member-row">
                  <span className="initial initial-lg" aria-hidden="true">{user?.firstName.charAt(0)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{user?.firstName} {user?.lastName}</span><span className="tag">You</span></span>
                    <span className="fine block">Account holder · Pays for all visits</span>
                  </span>
                  <span className="fine flex items-center gap-1.5 font-medium">{lock}Primary</span>
                </li>
                {family.data!.members.map((m) => {
                  const visits = upcomingFor(m)
                  return (
                    <li key={m.id} className="member-row">
                      <span className="initial initial-lg initial-warm" aria-hidden="true">{m.firstName.charAt(0)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{m.firstName} {m.lastName}</span><span className="tag tag-warm">{m.relationship === 'child' ? 'Child' : 'Adult you care for'}</span></span>
                        <span className="fine block">Born {birthDate(m.dateOfBirth)} · {yearsOld(m.dateOfBirth)}{visits && ` · ${visits}`}</span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setBookFor({ for: m.relationship, memberId: m.id }); navigate('/book') }}>{plus}Book for {m.firstName}</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(m)}>Edit<span className="sr-only"> {m.firstName}</span></button>
                        <button type="button" className="btn btn-quiet btn-sm" style={{ color: 'var(--color-muted)' }} onClick={() => { setRemoveError(null); setRemoving(m) }}>Remove<span className="sr-only"> {m.firstName}</span></button>
                      </span>
                    </li>
                  )
                })}
              </ul>
              {family.data!.members.length === 0 && (
                <div className="mt-6"><Empty title="No family members yet" image={<Still name="empty-no-family" className="aspect-[3/2]" />}>Add a child or an adult you care for, and you can book visits for them.</Empty></div>
              )}
            </>
          )}
      </section>

      <section aria-labelledby="add-title" className="card mt-10 p-6 sm:p-9">
        <h2 id="add-title">Add a family member</h2>
        <p className="muted mt-2">Their visits stay under your account. Children never get their own login.</p>
        <hr className="rule my-7" />
        <MemberForm submitLabel="Add family member" onSave={async (m) => { await api.addFamily(m); setStatus(`${m.firstName} was added.`); family.reload() }} />
      </section>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.firstName}` : 'Edit'}>
        {editing && (
          <MemberForm key={editing.id} initial={editing} submitLabel="Save changes" onCancel={() => setEditing(null)}
            onSave={async (m) => { await api.updateFamily(editing.id, m); setStatus('Changes saved.'); setEditing(null); family.reload() }} />
        )}
      </Dialog>

      <Dialog open={!!removing} onClose={() => setRemoving(null)} title={removing ? `Remove ${removing.firstName}?` : 'Remove'}>
        <p className="muted">You won’t be able to book for them until you add them again. Past visits stay in your account.</p>
        <div className="mt-4"><FormError error={removeError} /></div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn btn-danger" disabled={removePending} onClick={remove}>{removePending ? 'Removing…' : 'Remove'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => setRemoving(null)}>Keep</button>
        </div>
      </Dialog>
    </>
  )
}

// ---------- Profile ----------

export function ProfilePage() {
  const { user, refresh, signOut } = useSession()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  if (!user) return <Loading />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const firstName = val(f, 'firstName'), lastName = val(f, 'lastName')
    const phone = toE164(val(f, 'phone'))
    const errs: Errors = {}
    if (!firstName) errs.firstName = 'Enter your first name.'
    if (!lastName) errs.lastName = 'Enter your last name.'
    if (!phone) errs.phone = 'Enter a mobile number, like 912 345 678 or +44 7700 900123.'
    setErrors(errs)
    setError(null)
    setSaved(false)
    if (Object.keys(errs).length) {
      form.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus()
      return
    }
    setPending(true)
    try {
      await api.updateMe({ firstName, lastName, phone: phone! })
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageTitle title="Profile" lede="Your doctor sees your name. We use your mobile to confirm it’s you before each visit.">Profile</PageTitle>
      <form noValidate onSubmit={onSubmit} className="card mt-8 grid gap-5 p-6 sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" name="firstName" autoComplete="given-name" defaultValue={user.firstName} error={errors.firstName} />
          <Field label="Last name" name="lastName" autoComplete="family-name" defaultValue={user.lastName} error={errors.lastName} />
        </div>
        <Field label="Mobile number" name="phone" type="tel" autoComplete="tel" defaultValue={user.phone} error={errors.phone} hint="Portuguese numbers can skip +351." />
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="field-label">Email</dt><dd className="mt-1 break-words">{user.email}</dd></div>
          <div><dt className="field-label">Date of birth</dt><dd className="mt-1">{birthDate(user.dateOfBirth)}</dd></div>
        </dl>
        <p className="fine -mt-2">To change your email, contact support. Date of birth can’t be changed online.</p>
        <FormError error={error} />
        <div role="status" aria-live="polite">{saved && <Notice tone="ok">Your profile is saved.</Notice>}</div>
        <div><button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button></div>
      </form>
      <button type="button" className="btn btn-secondary mt-8" onClick={async () => { await signOut(); navigate('/signin') }}>Sign out</button>
    </>
  )
}

// ---------- Security ----------

function ChangePassword() {
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const current = String(f.get('current') ?? ''), next = String(f.get('next') ?? ''), again = String(f.get('again') ?? '')
    const errs: Errors = {}
    if (!current) errs.current = 'Enter your current password.'
    if (next.length < 8) errs.next = 'Use at least 8 characters.'
    else if (next !== again) errs.again = 'The two passwords don’t match.'
    setErrors(errs)
    setError(null)
    setDone(false)
    if (Object.keys(errs).length) {
      form.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus()
      return
    }
    setPending(true)
    try {
      await api.auth.changePassword(current, next)
      form.reset()
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_PASSWORD') setErrors({ current: err.message })
      else if (err instanceof ApiError && (err.code === 'PASSWORD_COMPROMISED' || err.code === 'PASSWORD_TOO_SHORT')) setErrors({ next: err.message })
      else setError(errMsg(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-labelledby="pw-title" className="card mt-8 p-6 sm:p-8">
      <h2 id="pw-title">Password</h2>
      <p className="muted mt-2 mb-6">Changing it signs you out on your other devices.</p>
      <form noValidate onSubmit={onSubmit} className="grid gap-5">
        <Field label="Current password" name="current" type="password" autoComplete="current-password" error={errors.current} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="New password" name="next" type="password" autoComplete="new-password" hint="At least 8 characters." error={errors.next} />
          <Field label="Type it again" name="again" type="password" autoComplete="new-password" error={errors.again} />
        </div>
        <FormError error={error} />
        <div role="status" aria-live="polite">{done && <Notice tone="ok">Your password has been changed.</Notice>}</div>
        <div><button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Change password'}</button></div>
      </form>
    </section>
  )
}

/** The base32 secret from an otpauth:// URI, in groups of four for typing into an app. */
function setupKey(totpURI: string): string {
  const secret = new URL(totpURI.replace(/^otpauth:/, 'https:')).searchParams.get('secret') ?? ''
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret
}

function TwoFactor() {
  const { user, refresh } = useSession()
  const [step, setStep] = useState<'idle' | 'password' | 'verify' | 'disable'>('idle')
  const [setup, setSetup] = useState<{ key: string; codes: string[] } | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const on = !!user?.twoFactorEnabled

  const reset = () => { setStep('idle'); setSetup(null); setFieldError(null); setError(null); setCopied(false) }

  async function submit(e: FormEvent<HTMLFormElement>, fn: (value: string) => Promise<void>, fieldCodes: string[]) {
    e.preventDefault()
    const v = String(new FormData(e.currentTarget).get('v') ?? '').trim()
    setFieldError(null)
    setError(null)
    if (!v) return setFieldError(step === 'verify' ? 'Enter the 6-digit code.' : 'Enter your password.')
    setPending(true)
    try {
      await fn(v)
    } catch (err) {
      if (err instanceof ApiError && fieldCodes.includes(err.code)) setFieldError(err.message)
      else setError(errMsg(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-labelledby="tf-title" className="card mt-8 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tf-title">Two-factor sign-in</h2>
        <span className={`badge ${on ? 'badge-ok' : ''}`}>{on ? 'On' : 'Off'}</span>
      </div>
      <p className="muted mt-2">After your password, we also ask for a code from an authenticator app on your phone.</p>
      <div role="status" aria-live="polite" className="mt-4 empty:mt-0">{notice && <Notice tone="ok">{notice}</Notice>}</div>

      {step === 'idle' && (
        <button type="button" className={`btn ${on ? 'btn-secondary' : 'btn-primary'} mt-6`} onClick={() => { setNotice(null); setStep(on ? 'disable' : 'password') }}>
          {on ? 'Turn off two-factor' : 'Turn on two-factor'}
        </button>
      )}

      {(step === 'password' || step === 'disable') && (
        <form noValidate className="mt-6 grid gap-5" onSubmit={(e) => submit(e, async (pw) => {
          if (step === 'disable') {
            await api.auth.disableTwoFactor(pw)
            await refresh()
            reset()
            setNotice('Two-factor sign-in is off.')
          } else {
            const r = await api.auth.enableTwoFactor(pw)
            setSetup({ key: setupKey(r.totpURI), codes: r.backupCodes })
            setStep('verify')
          }
        }, ['INVALID_PASSWORD'])}>
          <Field label="Your password" name="v" type="password" autoComplete="current-password" autoFocus error={fieldError}
            hint={step === 'disable' ? 'To turn two-factor off, confirm it’s you.' : 'To turn two-factor on, confirm it’s you.'} />
          <FormError error={error} />
          <div className="flex flex-wrap gap-3">
            <button className={`btn ${step === 'disable' ? 'btn-danger' : 'btn-primary'}`} disabled={pending}>{pending ? 'Checking…' : step === 'disable' ? 'Turn off' : 'Continue'}</button>
            <button type="button" className="btn btn-secondary" onClick={reset}>Cancel</button>
          </div>
        </form>
      )}

      {step === 'verify' && setup && (
        <div className="mt-6 grid gap-6">
          <ol className="grid gap-5 pl-5 list-decimal marker:text-[var(--color-muted)]">
            <li>
              <p>In your authenticator app, add an account and enter this setup key:</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <code className="rounded-[10px] bg-[var(--color-mist)] px-4 py-3 font-mono text-[17px] tracking-wider break-all">{setup.key}</code>
                <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
                  try { await navigator.clipboard.writeText(setup.key.replace(/\s/g, '')); setCopied(true) } catch { setCopied(false) }
                }}>{copied ? 'Copied' : 'Copy key'}</button>
              </div>
              <p className="sr-only" role="status" aria-live="polite">{copied ? 'Setup key copied.' : ''}</p>
            </li>
            <li>
              <p>Keep these backup codes somewhere safe. Each one signs you in once if you lose your phone.</p>
              <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-[15px] sm:grid-cols-4">
                {setup.codes.map((c) => <li key={c} className="rounded-lg bg-[var(--color-mist)] px-3 py-2 text-center">{c}</li>)}
              </ul>
            </li>
            <li>
              <p>Enter the 6-digit code your app shows now.</p>
              <form noValidate className="mt-3 grid gap-5" onSubmit={(e) => submit(e, async (code) => {
                await api.auth.verifyTotp(code)
                await refresh()
                reset()
                setNotice('Two-factor sign-in is on. You’ll need a code each time you sign in.')
              }, ['INVALID_TWO_FACTOR_CODE', 'INVALID_CODE'])}>
                <Field label="Code" name="v" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" error={fieldError} className="max-w-[220px]" />
                <FormError error={error} />
                <div className="flex flex-wrap gap-3">
                  <button className="btn btn-primary" disabled={pending}>{pending ? 'Checking…' : 'Turn on'}</button>
                  <button type="button" className="btn btn-secondary" onClick={reset}>Cancel</button>
                </div>
              </form>
            </li>
          </ol>
        </div>
      )}
    </section>
  )
}

export function SecurityPage() {
  return (
    <>
      <PageTitle title="Security" lede="Keep your account, and your family’s visits, safe.">Security</PageTitle>
      <ChangePassword />
      <TwoFactor />
    </>
  )
}

// ---------- Payments and refunds: a statement ticket, then the refund terms from content/patient-journey/cancellation.md ----------
const pIco = (d: ReactNode, size = 14) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
const P_ICONS = {
  receipt: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5M16 13H8M16 17H8M10 9H8" /></>,
  download: <path d="M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5" />,
  check: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" /></>,
  late: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  video: <><path d="m16 13 5.2 3.1a.5.5 0 0 0 .8-.4V8.3a.5.5 0 0 0-.8-.4L16 11" /><rect x="2" y="6" width="14" height="12" rx="2" /></>,
  drop: <><path d="M12 20h.01M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2-1.4M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8a15 15 0 0 0-11.3-3.8M2 2l20 20" /></>,
  move: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v3l2 1" /></>,
  ended: <path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 4.2 2 2 0 0 1 5.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.4 2.1L9 9.8M22 2 2 22" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>,
  wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></>,
}
/** "23 Oct – 9 Nov 2026", in Lisbon. */
const period = (a: string, b: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).formatRange(new Date(a), new Date(b))
/** The body of one "## Title" section of a content file. */
const section = (body: string, title: string) => body.split(/^##\s+/m).find((s) => s.startsWith(title))?.slice(title.length).trim() ?? ''

export function PaymentsPage() {
  const upcoming = useLoad(() => api.appointments('upcoming'), [])
  const past = useLoad(() => api.appointments('past'), [])
  const error = upcoming.error ?? past.error
  const loading = !upcoming.data || !past.data
  // ponytail: built from the two appointment lists (only paid visits have a payment); a /api/payments list can
  // replace this if a patient ever has hundreds of visits.
  const paid = [...(upcoming.data?.appointments ?? []), ...(past.data?.appointments ?? [])]
    .filter((a) => a.payment)
    .sort((x, y) => y.startsAt.localeCompare(x.startsAt))
  const charged = paid.filter((a) => paymentStatus(a).label === 'Paid')
  const refunded = paid.filter((a) => paymentStatus(a).label === 'Refunded')
  const cancelled = paid.length - charged.length - refunded.length
  const total = charged.reduce((n, a) => n + a.payment!.amount, 0)

  // ponytail: a CSV built in the browser; a signed PDF statement can come from the API once real payments exist.
  function download() {
    const rows = [['Visit date', 'Service', 'Doctor', 'For', 'Status', 'Paid on', 'Amount (EUR)'],
      ...paid.map((a) => [fullDate(a.startsAt), a.service.groupName, a.doctor.name, a.patient?.displayName ?? 'You', paymentStatus(a).label, shortDate(a.payment!.paidAt), paymentStatus(a).label === 'Paid' ? a.payment!.amount.toFixed(2) : '0.00'])]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: 'carevia-statement.csv' }).click()
    URL.revokeObjectURL(url)
  }

  const terms = content('cancellation')
  const cancelRules = section(terms.body, 'Cancelling').split(/\r?\n/).filter((l) => l.startsWith('- ')).map((l) => l.slice(2))
  const steps = [
    { tick: 'Booking confirmed', title: 'Free cancellation', icon: P_ICONS.check, tone: 'ok', body: `${cancelRules[0] ?? ''} The time is released for other patients.` },
    { tick: '[X hours] before', title: 'Late cancellation', icon: P_ICONS.late, tone: 'late', body: cancelRules.slice(1).join(' ') },
    { tick: 'Start', title: 'Consultation', icon: P_ICONS.video, tone: 'now', body: 'Join from 10 minutes before the start time.' },
    { tick: 'Up to 60 min after the end', title: 'Reconnect window', icon: P_ICONS.drop, tone: 'after', body: section(terms.body, 'If the call drops') },
  ]
  const situations = [
    { title: 'Changing the time', icon: P_ICONS.move },
    { title: 'If your doctor ends the call', icon: P_ICONS.ended },
    { title: 'If we cancel', icon: P_ICONS.alert },
  ]

  return (
    <>
      <PageTitle title="Payments & refunds" lede="Every visit you’ve paid for. In this demo no money is taken, so there is nothing to refund."
        eyebrow={<span className="k" style={{ color: 'var(--color-accent)', fontSize: 13 }}>Billing</span>}>Payments &amp; refunds</PageTitle>
      <section aria-labelledby="payments-title" className="mt-9">
        <h2 id="payments-title" className="sr-only">Your payments</h2>
        {error ? <ErrorState error={error} onRetry={() => { upcoming.reload(); past.reload() }} title="We couldn’t load your payments" />
          : loading ? <Loading label="Loading your payments" lines={3} />
          : paid.length === 0 ? <Empty title="No payments yet" art="caught-up" action={<Link to="/book" className="btn btn-primary btn-sm">Book new care</Link>}>When you pay for a visit, it appears here with its receipt.</Empty>
          : (
            <div className="bp statement">
              <div className="bp-body gap-0 pb-5">
                <div className="ledger-head">
                  <div>
                    <p className="k">Statement</p>
                    <p className="mt-0.5 font-serif text-[22px] leading-[26px] text-ink">{period(paid[paid.length - 1].startsAt, paid[0].startsAt)}</p>
                  </div>
                  <p className="flex items-center gap-5"><span className="text-[13px] text-muted">{paid.length} visit{paid.length === 1 ? '' : 's'}</span><span className="k max-sm:hidden">Amount</span></p>
                </div>
                <ul>
                  {paid.map((a) => {
                    const s = paymentStatus(a)
                    const [day, month] = dayMonth(a.startsAt)
                    const off = s.label !== 'Paid'
                    return (
                      <li key={a.id} className={`ledger-row${off ? ' is-off' : ''}`}>
                        <span className="ledger-date"><span className="font-serif text-[24px] leading-6">{day}</span><span className="text-[10px] font-medium tracking-[0.12em] text-muted">{month}</span></span>
                        <span className="min-w-0">
                          <span className="block text-[15px] leading-[23px]"><span className="ledger-service font-medium">{a.service.groupName}</span> <span className="text-muted">· {a.doctor.name}</span></span>
                          <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-5">
                            <span className={`ledger-dot${off ? '' : ' ok'}`} aria-hidden="true" />
                            <span className={off ? 'text-muted' : 'text-ok'}>{s.label === 'Paid' ? `Paid ${shortDate(a.payment!.paidAt)}` : s.label === 'Refunded' ? 'Refunded' : 'Cancelled · no money taken'}</span>
                            {a.patient?.kind === 'family' && <span className="font-medium text-accent">· For {a.patient.displayName}</span>}
                          </span>
                        </span>
                        <Link to={`/visits/${a.id}/receipt`} className="ledger-receipt">{pIco(P_ICONS.receipt)}Receipt<span className="sr-only"> for the visit on {fullDate(a.startsAt)}</span></Link>
                        <span className="ledger-amount">
                          <span className="font-serif text-[18px] leading-[22px] tabular-nums">{euroCents(off ? 0 : a.payment!.amount)}</span>
                          {off && <span className="block text-[11px] text-muted"><s>{euro(a.payment!.amount)}</s> {s.label === 'Refunded' ? 'refunded' : 'voided'}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div className="bp-perf" aria-hidden="true" />
              <div className="bp-stub">
                <div>
                  <p className="k">Total paid</p>
                  <p className="mt-1.5 font-serif text-[72px] leading-[72px] tracking-[-0.03em] tabular-nums">{euro(total)}</p>
                  <p className="mt-1.5 text-[13px] text-[#b9c7d8]">{charged.length} paid visit{charged.length === 1 ? '' : 's'}{cancelled ? ` · ${cancelled} cancelled` : ''}{refunded.length ? ` · ${refunded.length} refunded` : ''}</p>
                </div>
                <dl className="stub-figures">
                  <div><dt>Refunded</dt><dd>{euroCents(refunded.reduce((n, a) => n + a.payment!.amount, 0))}</dd></div>
                  <div><dt>Pending refunds</dt><dd>None</dd></div>
                  <div><dt>Paid with</dt><dd>Demo payment</dd></div>
                </dl>
                <button type="button" className="btn btn-sm bp-cta w-full" onClick={download}>{pIco(P_ICONS.download)}Download statement</button>
              </div>
            </div>
          )}
      </section>

      <section aria-labelledby="refund-title" className="mt-20 grid gap-7">
        <div>
          <p className="k" style={{ color: 'var(--color-accent)', fontSize: 12 }}>When plans change</p>
          <h2 id="refund-title" className="mt-2.5">{terms.title}</h2>
          <p className="muted mt-2.5">What happens depends on when it happens. Find your moment on the timeline.</p>
        </div>
        <div className="card p-6 sm:p-8">
          <ol className="tl">
            {steps.map((st) => (
              <li key={st.title} className={`tl-step tl-${st.tone}`}>
                <span className="tl-tick">{st.tick}</span>
                <span className="tl-track" aria-hidden="true"><span className="tl-node" /><span className="tl-bar" /></span>
                <h3 className="tl-title">{pIco(st.icon)}{st.title}</h3>
                <p className="tl-body">{st.body}</p>
              </li>
            ))}
            <li className="tl-cap" aria-hidden="true" />
          </ol>
          <div className="situations">
            {situations.map((x) => (
              <div key={x.title}>
                <h3 className="flex items-center gap-2.5 text-[15px] font-medium leading-5 text-ink"><span className="sit-ico">{pIco(x.icon)}</span>{x.title}</h3>
                <div className="sit-body"><Markdown source={section(terms.body, x.title)} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="refund-band">
          <span className="grid size-10 flex-none place-items-center rounded-full bg-ink text-white">{pIco(P_ICONS.wallet, 18)}</span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium leading-5 text-ink">How refunds are paid</h3>
            <div className="sit-body mt-0.5"><Markdown source={section(terms.body, 'How refunds are paid')} /></div>
          </div>
        </div>
      </section>
    </>
  )
}

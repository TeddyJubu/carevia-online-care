import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { content } from '../lib/content'
import { DEMO_BUILD, useDemo } from '../lib/demo'
import { useLoad, useNow } from '../lib/load'
import { readQuestions, useQuestions } from '../lib/questions'
import { useSession } from '../lib/session'
import { countdown, fullDate, hhmm, minutes, when } from '../lib/time'
import type { Appointment } from '../lib/types'
import { TimePicker } from './time-picker'
import { Documents } from '../ui/documents'
import { Dialog, DoctorAvatar, Emergency, ErrorState, euro, euroCents, FormError, Loading, Markdown, Notice, PageTitle, paymentStatus } from '../ui/kit'

export function useAppointment() {
  const { id = '' } = useParams()
  return useLoad(() => api.appointment(id).then((r) => r.appointment), [id])
}

export type Phase = 'before' | 'open' | 'closed'

/** Mirrors the API's canReschedule: confirmed, and not started, or the call dropped and rejoining is over. */
export function canReschedule(a: Appointment, now = Date.now()): boolean {
  if (a.status !== 'confirmed') return false
  if (now < Date.parse(a.startsAt)) return true
  return a.outcome === 'ended_poor_quality' && now >= Date.parse(a.call.joinClosesAt)
}
export function phaseOf(a: Appointment, now = Date.now()): Phase {
  if (now < Date.parse(a.call.joinOpensAt)) return 'before'
  return now < Date.parse(a.call.joinClosesAt) ? 'open' : 'closed'
}

/** Loading and error states shared by every visit screen. */
export function VisitGate({ load, children }: { load: ReturnType<typeof useAppointment>; children: (a: Appointment) => React.ReactNode }) {
  // A 404 won't change on retry (old link, or another person's visit): point to the account instead.
  if (load.error?.status === 404) return (
    <div className="page-narrow">
      <PageTitle lede="The link may be old, or the visit belongs to another account.">We couldn’t find this visit</PageTitle>
      <Link to="/appointments" className="btn btn-primary mt-8">Go to your appointments</Link>
    </div>
  )
  if (load.error) return <div className="page-narrow"><ErrorState error={load.error} onRetry={load.reload} /></div>
  if (!load.data) return <div className="page-narrow"><Loading label="Loading your visit" /></div>
  return <>{children(load.data)}</>
}

export function VisitCard({ a }: { a: Appointment }) {
  return (
    <div className="card">
      <p className="text-[22px] font-medium">{when(a.startsAt)} · {minutes(a.startsAt, a.endsAt)} min</p>
      <p className="muted mt-1">{a.service.groupName} · {a.service.name} · video</p>
      <div className="mt-4 flex items-center gap-3">
        <DoctorAvatar doctor={a.doctor} size={44} />
        <p className="text-[15px]"><span className="font-medium">{a.doctor.name}</span><br /><span className="fine">{a.doctor.specialty} · Cédula {a.doctor.cedula}</span></p>
      </div>
      {a.patient?.kind === 'family' && <p className="mt-4 text-[15px]">For <span className="font-medium">{a.patient.displayName}</span>. Join with them.</p>}
    </div>
  )
}

function CalendarLink({ a }: { a: Appointment }) {
  const [href, setHref] = useState(api.calendarUrl(a.id))
  useEffect(() => {
    if (import.meta.env.VITE_API_MOCK !== '1') return
    let url = ''
    import('../lib/mock').then(({ mockIcs }) => {
      url = URL.createObjectURL(new Blob([mockIcs(a.id)], { type: 'text/calendar' }))
      setHref(url)
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [a.id])
  return <a href={href} download="carevia-visit.ics" className="btn btn-secondary">Add to calendar</a>
}

export const PREP = ['Write down what you’d like to discuss', 'Have a list of any medicines you take nearby', 'Find a quiet, private place with good light', 'Charge your device and check your internet']

// ---------- J7: booked, and how to prepare ----------
// Two columns on desktop: the visit and what to do with it on the left; reminders and payment on the right.
export function Prepare() {
  const load = useAppointment()
  const [params] = useSearchParams()
  const booked = params.get('booked') === '1'
  const moved = params.get('moved') === '1'
  const navigate = useNavigate()
  const demo = useDemo()
  const now = useNow(15000)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  return (
    <VisitGate load={load}>{(a) => {
      const phase = phaseOf(a, now)
      if (a.status === 'completed' || (a.status === 'confirmed' && phase === 'closed')) return <RedirectTo to={`/visits/${a.id}/done`} />
      // Pre-join (confirm email and mobile) is allowed any time before the window closes; the waiting room's device
      // check works any time too. Only joining the call waits for the window.
      const joinTo = a.preJoin?.confirmedAt ? `/visits/${a.id}/waiting` : `/visits/${a.id}/join`
      const opensIn = countdown(a.call.joinOpensAt, now)
      const allLink = <Link to="/appointments" className="link inline-flex min-h-11 items-center text-sm">All appointments</Link>
      return (
        <div className="page">
          <div className="grid gap-10 min-[1025px]:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0">
              {booked && <span className="mb-6 grid size-14 place-items-center rounded-full border border-ink" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>}
              <PageTitle eyebrow={a.status === 'cancelled' ? 'Cancelled' : booked ? 'Payment received (demo)' : 'Your visit'} title={booked ? 'You’re booked' : 'Your visit'}>
                {a.status === 'cancelled' ? 'This visit was cancelled' : booked ? 'You’re booked' : 'Your visit'}
              </PageTitle>
              {moved && <p role="status" className="notice notice-ok mt-6">Your visit has a new time. We’ve emailed you the details.</p>}
              {booked && a.status === 'confirmed' && (
                <Notice tone="ok" className="mt-6 flex-wrap items-center gap-x-4 gap-y-0">
                  <span role="status">We’ve emailed your confirmation.</span>
                  {DEMO_BUILD && demo && <Link to="/dev/outbox" className="link inline-flex min-h-11 items-center">See it in the demo outbox</Link>}
                </Notice>
              )}
              <div className="mt-8"><VisitCard a={a} /></div>
              {a.status === 'confirmed' && (
                <>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {phase === 'open'
                      ? <Link to={joinTo} className="btn btn-primary">Open waiting room</Link>
                      : <Link to={joinTo} className="btn btn-primary" aria-describedby="prep-hint">Prepare for consultation</Link>}
                    <CalendarLink a={a} />
                  </div>
                  {phase === 'before' && (
                    <p id="prep-hint" className="fine mt-3 max-w-[60ch]">
                      Check your camera, microphone and connection, and confirm your details, any time before.
                      {' '}The waiting room opens at {hhmm(a.call.joinOpensAt)}, 10 minutes before.
                      {opensIn && Date.parse(a.call.joinOpensAt) - now < 864e5 ? ` That’s in ${opensIn.replace(/:\d\d$/, ' min')}.` : ''}
                    </p>
                  )}
                  <div className="mt-6 flex flex-wrap gap-x-6">
                    {canReschedule(a, now) && (
                      <>
                        <Link to={`/visits/${a.id}/reschedule`} className="link inline-flex min-h-11 items-center text-sm">Change the time</Link>
                        <button type="button" className="link inline-flex min-h-11 items-center text-sm" onClick={() => setCancelling(true)}>Cancel this visit</button>
                      </>
                    )}
                    {allLink}
                  </div>
                  <div className="mt-10"><Preparation a={a} /></div>
                </>
              )}
              {a.status === 'cancelled' && (
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Link to={`/book/doctors?group=${a.service.groupSlug}&service=${a.service.id}`} className="btn btn-primary">Book another time</Link>
                  {allLink}
                </div>
              )}
            </section>
            <aside className="grid content-start gap-4" aria-label="Reminders, payment and documents">
              {a.status === 'confirmed' && <Reminders a={a} onSaved={load.set} />}
              <PaymentCard a={a} />
              <Documents a={a} />
            </aside>
          </div>
          <Dialog open={cancelling} onClose={() => setCancelling(false)} title="Cancel this visit?">
            <p>{when(a.startsAt)} with {a.doctor.name}.</p>
            <div className="card card-mist mt-4 max-h-[40svh] overflow-auto" tabIndex={0} role="region" aria-label="Cancellation terms"><Markdown source={content("cancellation").body} /></div>
            <FormError error={cancelError} />
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn btn-danger" disabled={pending} onClick={async () => {
                setPending(true)
                setCancelError(null)
                try { load.set((await api.cancel(a.id)).appointment); setCancelling(false); navigate(`/visits/${a.id}`, { replace: true }) } catch (e) { setCancelError((e as ApiError).message) } finally { setPending(false) }
              }}>{pending ? 'Cancelling…' : 'Cancel visit'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setCancelling(false)}>Keep my visit</button>
            </div>
          </Dialog>
        </div>
      )
    }}</VisitGate>
  )
}

/** Email and SMS reminder choices. The API sends one reminder about 24 hours before (apps/api/src/reminders.js). */
function Reminders({ a, onSaved }: { a: Appointment; onSaved: (a: Appointment) => void }) {
  const { user } = useSession()
  const saved = a.reminders ?? { email: true, sms: false, sentAt: null }
  const [email, setEmail] = useState(saved.email)
  const [sms, setSms] = useState(saved.sms)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const dirty = email !== saved.email || sms !== saved.sms
  // Mirrors the API's reminderDue: a visit paid for inside the last 24 hours gets no separate reminder.
  const bookedLate = !!a.payment && Date.parse(a.payment.paidAt) >= Date.parse(a.startsAt) - 864e5
  const timing = saved.sentAt ? `Reminder sent on ${fullDate(saved.sentAt)} at ${hhmm(saved.sentAt)}.`
    : bookedLate ? 'You booked less than 24 hours ahead, so your confirmation email is your reminder.'
    : 'We’ll remind you 24 hours before the visit.'
  async function save(e: FormEvent) {
    e.preventDefault()
    setPending(true); setError(null); setDone(false)
    try { onSaved((await api.setReminders(a.id, email, sms)).appointment); setDone(true) } catch (err) { setError((err as ApiError).message) } finally { setPending(false) }
  }
  const change = (set: (v: boolean) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { set(e.target.checked); setDone(false) }
  return (
    <section className="card" aria-labelledby="rem-title">
      <h2 id="rem-title" className="text-[22px]">Appointment reminders</h2>
      <p id="rem-when" className="fine mt-1">{timing}</p>
      <form className="mt-2" onSubmit={save}>
        <fieldset aria-describedby="rem-when">
          <legend className="sr-only">Remind me by</legend>
          <label className="check">
            <input type="checkbox" checked={email} onChange={change(setEmail)} />
            <span>Email reminder{user?.email && <span className="fine block break-all">To {user.email}</span>}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={sms} onChange={change(setSms)} aria-describedby="sms-note" />
            <span>SMS reminder<span id="sms-note" className="fine block">SMS reminders are not sent yet. We’ll keep your choice for when they are.</span></span>
          </label>
        </fieldset>
        <FormError error={error} />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button className="btn btn-secondary btn-sm" disabled={pending}>{pending ? 'Saving…' : 'Save reminders'}</button>
          <p role="status" className="fine">{done && !dirty && <span className="inline-block [animation:pop_0.35s_var(--ease)]">Reminders saved.</span>}</p>
        </div>
      </form>
    </section>
  )
}

function PaymentCard({ a }: { a: Appointment }) {
  const s = paymentStatus(a)
  return (
    <section className="card" aria-labelledby="pay-title">
      <h2 id="pay-title" className="text-[22px]">Payment &amp; receipt</h2>
      <p className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-[28px] font-medium leading-none tabular-nums">{euro(a.payment?.amount ?? a.fee)}</span>
        <span className={`badge ${s.tone}`}>{s.label}</span>
      </p>
      {a.payment && <p className="fine mt-2">Demo payment on {fullDate(a.payment.paidAt)}</p>}
      {a.status === 'cancelled' && <p className="mt-3 text-[15px]">This visit was cancelled. No money was taken in this demo.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link to="/account/payments" className="link inline-flex min-h-11 items-center text-sm">Payments &amp; refunds</Link>
      </div>
    </section>
  )
}

// ---------- Receipt: a printable payment confirmation. Payment only: nothing clinical, and not a tax invoice. ----------
export function Receipt() {
  const load = useAppointment()
  return (
    <VisitGate load={load}>{(a) => {
      if (!a.payment) return (
        <div className="page-narrow">
          <PageTitle lede="Nothing was paid for this visit.">There’s no receipt for this visit</PageTitle>
          <Link to={`/visits/${a.id}`} className="btn btn-primary mt-8">Back to your visit</Link>
        </div>
      )
      const s = paymentStatus(a)
      const rows: [string, string][] = [
        ['Amount', euroCents(a.payment.amount)],
        ['Status', s.label],
        ['Date paid', `${fullDate(a.payment.paidAt)}, ${hhmm(a.payment.paidAt)}`],
        ['Payment method', 'Demo payment'],
        ['Service', `Video consultation · ${a.service.groupName}`],
        ['Visit date', `${fullDate(a.startsAt)}, ${hhmm(a.startsAt)} (Lisbon time)`],
        ['Reference', a.id],
      ]
      return (
        <div className="page-narrow receipt-page">
          <div className="no-print mb-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
            <Link to={`/visits/${a.id}`} className="btn btn-secondary">Back to your visit</Link>
          </div>
          <article className="card receipt-sheet" aria-labelledby="receipt-h">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[22px] font-semibold tracking-[-0.04em]">Carevia</p>
                <p className="fine">Provided by [legal entity name]</p>
              </div>
              <span className={`badge ${s.tone}`}>{s.label}</span>
            </div>
            <div id="receipt-h" className="mt-6 [&_h1]:text-[34px]"><PageTitle title="Payment confirmation">Payment confirmation</PageTitle></div>
            <p className="notice notice-warn mt-4">
              <span><strong className="font-medium">This is a demo payment confirmation, not a tax invoice (fatura).</strong>{' '}
              No money was taken. In Portugal, invoices are issued by invoicing software certified by the tax authority (AT), which this demo does not use.</span>
            </p>
            <dl className="rows mt-6">
              {rows.map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-3">
                  <dt className="muted">{k}</dt>
                  <dd className="m-0 text-right font-medium break-all">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="fine mt-6">This confirmation covers the payment only.</p>
          </article>
        </div>
      )
    }}</VisitGate>
  )
}

function RedirectTo({ to }: { to: string }) {
  const navigate = useNavigate()
  useEffect(() => { navigate(to, { replace: true }) }, [navigate, to])
  return null
}

/** The three check-in steps before the waiting room: the "Before your visit" list fully ticked and at least one
 * question (both on this device only), then "Confirm it's you" (pre-join, on the server). */
export function checkInSteps(a: Appointment): [boolean, boolean, boolean] {
  let ticks: boolean[] = []
  try { ticks = JSON.parse(localStorage.getItem(`carevia-prep-${a.id}`) ?? '[]') } catch { /* unreadable: none ticked */ }
  return [PREP.every((_, i) => ticks[i]), readQuestions(a.id).length > 0, !!a.preJoin?.confirmedAt]
}

function Preparation({ a }: { a: Appointment }) {
  const key = `carevia-prep-${a.id}`
  const [ticks, setTicks] = useState<boolean[]>(() => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] } })
  const [questions, setQuestions] = useQuestions(a.id)
  const [draft, setDraft] = useState('')
  const tick = (i: number, v: boolean) => { const t = [...ticks]; t[i] = v; setTicks(t); localStorage.setItem(key, JSON.stringify(t)) }
  function add(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setQuestions([...questions, { text: draft.trim(), done: false }])
    setDraft('')
  }
  return (
    <section className="card self-start" aria-labelledby="prep-title">
      <h2 id="prep-title">Before your visit</h2>
      <ul className="mt-3">
        {PREP.map((p, i) => (
          <li key={p}><label className="check"><input type="checkbox" checked={!!ticks[i]} onChange={(e) => tick(i, e.target.checked)} /><span>{p}</span></label></li>
        ))}
      </ul>
      <hr className="rule my-5" />
      <h3>Your questions for the doctor</h3>
      <p className="fine mt-1" id="q-note">Saved only on this device. Carevia never receives them. You’ll see them beside the video.</p>
      {questions.length > 0 && (
        <ol className="mt-3 grid gap-1">
          {questions.map((q, i) => (
            <li key={i} className="flex items-start justify-between gap-3 rounded-[10px] bg-mist px-3 py-2">
              <span className="pt-2.5">{q.text}</span>
              <button type="button" className="btn btn-quiet btn-sm shrink-0" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>Remove<span className="sr-only"> “{q.text}”</span></button>
            </li>
          ))}
        </ol>
      )}
      <form className="mt-3 flex gap-2" onSubmit={add}>
        <label htmlFor="q-new" className="sr-only">Add a question</label>
        <input id="q-new" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a question (optional)" aria-describedby="q-note" maxLength={300} />
        <button className="btn btn-secondary shrink-0">Add</button>
      </form>
    </section>
  )
}

// ---------- J8: confirm email and mobile, companion ----------
export function PreJoin() {
  const load = useAppointment()
  const { user } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [companion, setCompanion] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => { if (load.data?.preJoin) setCompanion(load.data.preJoin.companion) }, [load.data?.preJoin])

  return (
    <VisitGate load={load}>{(a) => {
      if (a.status !== 'confirmed') return <RedirectTo to={`/visits/${a.id}`} />
      async function onSubmit(e: FormEvent) {
        e.preventDefault()
        if (!email || !mobile) return setError('Please confirm both your email and your mobile number. If either is wrong, update it first.')
        setPending(true)
        setError(null)
        try { await api.preJoin(a.id, companion); navigate(`/visits/${a.id}/waiting`) } catch (err) { setError((err as ApiError).message); setPending(false) }
      }
      return (
        <form noValidate className="page-narrow" onSubmit={onSubmit}>
          <PageTitle eyebrow={`${when(a.startsAt)} · ${a.doctor.name}`} lede="Before a video consultation, we check that the contact details on your account are yours. It’s a Portuguese teleconsultation rule.">Confirm it’s you</PageTitle>
          <fieldset className="card mt-8">
            <legend className="sr-only">Your contact details</legend>
            <label className="check"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /><span>This is my email address: <strong className="font-medium break-all">{user?.email}</strong></span></label>
            <label className="check"><input type="checkbox" checked={mobile} onChange={(e) => setMobile(e.target.checked)} /><span>This is my mobile number: <strong className="font-medium">{user?.phone}</strong></span></label>
            <p className="fine mt-2">Something wrong? <Link to="/account/profile" className="link">Update your details</Link> first.</p>
          </fieldset>
          <fieldset className="card mt-4">
            <legend className="sr-only">Companion</legend>
            <label className="check">
              <input type="checkbox" checked={companion} onChange={(e) => setCompanion(e.target.checked)} aria-describedby="companion-hint" />
              <span><span className="font-medium">Someone will join me</span><span id="companion-hint" className="fine block mt-1">You have the right to be accompanied, as at an in-person visit. They can sit with you, or join from another device with a private link you’ll get during the call.</span></span>
            </label>
            {a.patient?.kind === 'family' && <p className="fine mt-2">You’re joining with {a.patient.displayName}. You don’t need to tick this for them.</p>}
          </fieldset>
          <FormError error={error} />
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={`/visits/${a.id}`} className="btn btn-secondary">Back</Link>
            <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Continue to the waiting room'}</button>
          </div>
        </form>
      )
    }}</VisitGate>
  )
}

// ---------- J11: after the visit ----------
export const IMED_TEXT = "Your doctor records this visit in iMED, Carevia's clinical system. Your clinical summary and anything your doctor decides to issue are available through iMED, not in Carevia."

export function Done() {
  const load = useAppointment()
  const now = useNow(30000)
  return (
    <VisitGate load={load}>{(a) => {
      const phase = phaseOf(a, now)
      const status = statusCopy(a, phase)
      return (
        <div className="page">
          <div className="grid gap-10 min-[1025px]:grid-cols-[minmax(0,1fr)_340px]">
            <section>
              <PageTitle eyebrow={`${fullDate(a.startsAt)} · ${a.service.groupName} · ${a.doctor.name}`} lede={status.lede}>{status.title}</PageTitle>
              {status.action && <div className="mt-6">{status.action}</div>}
              <section className="card mt-8" aria-labelledby="imed-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="imed-title" className="text-[22px]">Your clinical record</h2>
                  <span className="badge">iMED: not connected</span>
                </div>
                <p className="mt-3">{IMED_TEXT}</p>
              </section>
              <div className="mt-6"><Emergency compact /></div>
            </section>
            <aside className="grid content-start gap-3" aria-label="This visit">
              <VisitCard a={a} />
              <Documents a={a} />
              <Link to={`/book/doctors/${a.doctor.id}/times`} className="btn btn-primary btn-block">Book a follow-up</Link>
              <Link to="/appointments" className="btn btn-secondary btn-block">All appointments</Link>
            </aside>
          </div>
        </div>
      )
    }}</VisitGate>
  )
}

function statusCopy(a: Appointment, phase: Phase): { title: string; lede: string; action?: React.ReactNode } {
  const rejoin = <Link to={`/visits/${a.id}/waiting`} className="btn btn-primary">Rejoin the call</Link>
  if (a.status === 'cancelled') return { title: 'This visit was cancelled', lede: 'Nothing else to do. You can book another time whenever you need.' }
  switch (a.outcome) {
    case 'completed':
      return { title: 'Your visit is complete', lede: `Thank you for seeing ${a.doctor.name}. If you’re not getting better, or you have new worries, book a follow-up.` }
    case 'needs_in_person':
      return { title: 'Your doctor advises an in-person visit', lede: 'Your doctor thinks you need to be seen in person. Please arrange an appointment with your family doctor or a clinic soon. If things get worse, call 112.' }
    case 'no_show':
      return { title: 'We missed you', lede: 'The doctor waited, but the call didn’t connect. You can book another time.' }
    case 'ended_poor_quality':
      return phase === 'open'
        ? { title: 'The call ended because of the connection', lede: 'Your appointment is still open. Move somewhere with a stronger signal, then rejoin.', action: rejoin }
        : { title: 'The call ended because of the connection', lede: 'Your appointment stays open: it isn’t lost, and you won’t pay again. Choose a new time for the same visit.', action: <Link to={`/visits/${a.id}/reschedule`} className="btn btn-primary">Choose a new time</Link> }
    default:
      return phase === 'open'
        ? { title: 'Your doctor is finishing up', lede: 'If the call dropped, you can rejoin. Otherwise your doctor will record how the visit went in a few minutes.', action: rejoin }
        : { title: 'Your doctor is finishing up', lede: 'Your doctor will record how the visit went. Check back here soon.' }
  }
}


// ---------- Reschedule: the same appointment at another time (reuses the J3 picker) ----------
export function Reschedule() {
  const load = useAppointment()
  const navigate = useNavigate()
  return (
    <VisitGate load={load}>{(a) => {
      if (!canReschedule(a)) {
        return (
          <div className="page-narrow">
            <PageTitle lede="Only a confirmed visit that hasn’t started can be moved, or one whose call dropped once the time to rejoin has passed.">This visit can’t be moved</PageTitle>
            <Link to={`/visits/${a.id}`} className="btn btn-primary mt-8">Back to your visit</Link>
          </div>
        )
      }
      const dropped = a.outcome === 'ended_poor_quality'
      return (
        <div className="page">
          <div className="max-w-[760px]">
            <PageTitle eyebrow={`${a.service.groupName} · ${a.service.name}`}
              lede={<>{dropped ? 'Your call dropped and the time to rejoin has passed. ' : ''}Same visit, same payment: you won’t be charged again. Now: <strong className="font-medium text-ink">{when(a.startsAt)}</strong> with {a.doctor.name}.</>}>
              Choose a new time
            </PageTitle>
            <TimePicker groupSlug={a.service.groupSlug} service={{ id: a.service.id, name: a.service.name }} preferredDoctorId={a.doctor.id} preferredLabel="Your doctor" includePreferred
              back={`/visits/${a.id}`} verb="Move to" pendingLabel="Moving your visit…"
              submit={async (picked) => {
                await api.reschedule(a.id, picked.id)
                navigate(`/visits/${a.id}?moved=1`, { replace: true })
              }} />
            <div className="mt-8"><Emergency compact /></div>
          </div>
        </div>
      )
    }}</VisitGate>
  )
}

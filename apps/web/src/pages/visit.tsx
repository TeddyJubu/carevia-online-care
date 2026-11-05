import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, ApiError, MOCK } from '../lib/api'
import { content } from '../lib/content'
import { useLoad, useNow } from '../lib/load'
import { useQuestions } from '../lib/questions'
import { useSession } from '../lib/session'
import { countdown, fullDate, hhmm, minutes, when } from '../lib/time'
import type { Appointment } from '../lib/types'
import { Dialog, DoctorAvatar, Emergency, ErrorState, euro, FormError, Loading, Markdown, PageTitle } from '../ui/kit'

export function useAppointment() {
  const { id = '' } = useParams()
  return useLoad(() => api.appointment(id).then((r) => r.appointment), [id])
}

export type Phase = 'before' | 'open' | 'closed'
export function phaseOf(a: Appointment, now = Date.now()): Phase {
  if (now < Date.parse(a.call.joinOpensAt)) return 'before'
  return now < Date.parse(a.call.joinClosesAt) ? 'open' : 'closed'
}

/** Loading and error states shared by every visit screen. */
export function VisitGate({ load, children }: { load: ReturnType<typeof useAppointment>; children: (a: Appointment) => React.ReactNode }) {
  if (load.error) return <div className="page-narrow"><ErrorState error={load.error} onRetry={load.reload} title={load.error.status === 404 ? 'We couldn’t find this visit' : undefined} /></div>
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
    if (!MOCK) return
    let url = ''
    import('../lib/mock').then(({ mockIcs }) => {
      url = URL.createObjectURL(new Blob([mockIcs(a.id)], { type: 'text/calendar' }))
      setHref(url)
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [a.id])
  return <a href={href} download="carevia-visit.ics" className="btn btn-secondary">Add to calendar</a>
}

const PREP = ['Write down what you’d like to discuss', 'Have a list of any medicines you take nearby', 'Find a quiet, private place with good light', 'Charge your device and check your internet']

// ---------- J7: booked, and how to prepare ----------
export function Prepare() {
  const load = useAppointment()
  const [params] = useSearchParams()
  const booked = params.get('booked') === '1'
  const navigate = useNavigate()
  const now = useNow(15000)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  return (
    <VisitGate load={load}>{(a) => {
      const phase = phaseOf(a, now)
      if (a.status === 'completed' || (a.status === 'confirmed' && phase === 'closed')) return <RedirectTo to={`/visits/${a.id}/done`} />
      const joinTo = a.preJoin?.confirmedAt ? `/visits/${a.id}/waiting` : `/visits/${a.id}/join`
      return (
        <div className="page">
          <div className="grid gap-10 min-[1025px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section>
              {booked && <span className="mb-6 grid size-14 place-items-center rounded-full border border-ink" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>}
              <PageTitle eyebrow={a.status === 'cancelled' ? 'Cancelled' : booked ? 'Payment received (demo)' : 'Your visit'} title={booked ? 'You’re booked' : 'Your visit'}>
                {a.status === 'cancelled' ? 'This visit was cancelled' : booked ? 'You’re booked' : 'Your visit'}
              </PageTitle>
              <div className="mt-8"><VisitCard a={a} /></div>
              {a.status === 'confirmed' && (
                <>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {phase === 'open'
                      ? <Link to={joinTo} className="btn btn-primary">Get ready to join</Link>
                      : phase === 'before' && <span className="fine">You can join from {hhmm(a.call.joinOpensAt)}, 10 minutes before.{countdown(a.call.joinOpensAt, now) && Date.parse(a.call.joinOpensAt) - now < 864e5 ? ` That’s in ${countdown(a.call.joinOpensAt, now)!.replace(/:\d\d$/, ' min')}.` : ''}</span>}
                    <CalendarLink a={a} />
                  </div>
                  <p className="fine mt-4">{booked ? 'We’ve emailed your confirmation. ' : ''}Paid {euro(a.fee)} (demo).</p>
                  {phase !== 'closed' && Date.parse(a.startsAt) > now && (
                    <button type="button" className="link mt-8 inline-flex min-h-11 items-center text-sm" onClick={() => setCancelling(true)}>Cancel this visit</button>
                  )}
                </>
              )}
              {a.status === 'cancelled' && <Link to={`/book?service=${a.service.groupSlug}`} className="btn btn-primary mt-6">Book another time</Link>}
            </section>
            {a.status === 'confirmed' && <Preparation a={a} />}
          </div>
          <Dialog open={cancelling} onClose={() => setCancelling(false)} title="Cancel this visit?">
            <p>{when(a.startsAt)} with {a.doctor.name}.</p>
            <div className="card card-mist mt-4"><Markdown source={content('cancellation').body} /></div>
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

function RedirectTo({ to }: { to: string }) {
  const navigate = useNavigate()
  useEffect(() => { navigate(to, { replace: true }) }, [navigate, to])
  return null
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
      <Link to={`/visits/${a.id}/waiting`} className="btn btn-primary btn-block mt-6">Test camera and microphone</Link>
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
              <Link to={`/book?service=${a.service.groupSlug}&doctor=${a.doctor.id}`} className="btn btn-primary btn-block">Book a follow-up</Link>
              <Link to="/account" className="btn btn-secondary btn-block">Back to your account</Link>
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
        : { title: 'The call ended because of the connection', lede: 'Your appointment stays open: it isn’t lost or charged twice. The Carevia team will contact you to arrange a new time.' }
    default:
      return phase === 'open'
        ? { title: 'Your doctor is finishing up', lede: 'If the call dropped, you can rejoin. Otherwise your doctor will record how the visit went in a few minutes.', action: rejoin }
        : { title: 'Your doctor is finishing up', lede: 'Your doctor will record how the visit went. Check back here soon.' }
  }
}


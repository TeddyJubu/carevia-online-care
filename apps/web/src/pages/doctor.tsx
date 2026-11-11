import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { useLoad, useNow } from '../lib/load'
import { addDays, dayLabel, hhmm, lisbonDay, relDay, shortDate, when } from '../lib/time'
import type { Appointment, Outcome, OwnSlot } from '../lib/types'
import { DoctorAvatar, Empty, ErrorState, euro, Field, FormError, Loading, Notice, PageTitle } from '../ui/kit'
import { DailyRoom } from './call'
import { phaseOf, type Phase } from './visit'

/** iMED is where the doctor writes the record and issues anything. Carevia only links to it. */
function OpenImed({ className = 'btn btn-secondary' }: { className?: string }) {
  const link = useLoad(() => api.imedLink(), [])
  if (link.error) return <span className="fine">iMED link unavailable</span>
  return (
    <a href={link.data?.url ?? 'https://imed.pt/imed/home'} target="_blank" rel="noopener noreferrer" className={className} aria-disabled={!link.data}>
      Open iMED<span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

const OUTCOME: Record<Outcome, string> = {
  completed: 'Completed',
  ended_poor_quality: 'Ended: poor connection',
  needs_in_person: 'Needs in-person care',
  no_show: 'Patient didn’t join',
}
/** What the patient sees for each outcome, shown on the choice itself so the doctor reads it before recording. */
const SEES: Record<Outcome, string> = {
  completed: 'The patient sees that the visit is complete.',
  ended_poor_quality: 'The appointment stays open. The patient can rejoin or choose a new time, and isn’t charged again.',
  needs_in_person: 'The patient sees that you advise an in-person visit. Record your reasons in iMED.',
  no_show: 'The patient sees that the call didn’t connect.',
}

/** A confirmed visit whose call is over (or whose window closed) and still has no outcome. */
const needsOutcome = (a: Appointment, now: number) =>
  a.status === 'confirmed' && !a.outcome && (phaseOf(a, now) === 'closed' || a.call.state === 'ended')

function StatusBadge({ a, now }: { a: Appointment; now: number }) {
  if (a.status === 'cancelled') return <span className="badge">Cancelled</span>
  if (a.outcome) return <span className={`badge ${a.outcome === 'completed' ? 'badge-ok' : 'badge-warn'}`}>{OUTCOME[a.outcome]}</span>
  if (a.call.state === 'in_progress') return <span className="badge badge-ok">In call</span>
  if (needsOutcome(a, now)) return <span className="badge badge-warn">Outcome needed</span>
  return <span className="badge">Confirmed</span>
}

// ---------- J13: the day's agenda ----------
export function Agenda() {
  const [params, setParams] = useSearchParams()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : lisbonDay()
  const agenda = useLoad(() => api.agenda(date), [date])
  const now = useNow(30000)
  const go = (d: string) => setParams(d === lisbonDay() ? {} : { date: d })
  const d = agenda.data?.doctor
  const list = agenda.data?.appointments ?? []
  const live = list.filter((a) => a.status !== 'cancelled')
  const toRecord = list.filter((a) => needsOutcome(a, now)).length
  const next = list.find((a) => a.status === 'confirmed' && !a.outcome && Date.parse(a.endsAt) > now)

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <PageTitle eyebrow={d ? `${d.specialty} · Cédula ${d.cedula}` : 'Your agenda'} title="Your agenda">{d ? d.name : 'Your agenda'}</PageTitle>
        <div className="flex flex-wrap gap-3">
          <Link to="/doctor/profile" className="btn btn-secondary">Profile and open times</Link>
          <OpenImed />
        </div>
      </div>
      <div className="mt-8 flex flex-wrap items-end gap-3">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(addDays(date, -1))}>Previous day</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(lisbonDay())} disabled={date === lisbonDay()}>Today</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(addDays(date, 1))}>Next day</button>
        <Field label="Date" type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="w-48" />
      </div>
      <h2 className="mt-8" aria-live="polite">{dayLabel(`${date}T12:00:00Z`)}{dayLabel(`${date}T12:00:00Z`) === 'Today' || dayLabel(`${date}T12:00:00Z`) === 'Tomorrow' ? `, ${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}` : ''}</h2>
      {live.length > 0 && (
        <p className="fine mt-1">
          {live.length} visit{live.length > 1 ? 's' : ''}
          {next && ` · next at ${hhmm(next.startsAt)}`}
          {toRecord > 0 && <> · <span className="font-medium text-ink">{toRecord} outcome{toRecord > 1 ? 's' : ''} to record</span></>}
        </p>
      )}
      <div className="mt-4">
        {agenda.error ? <ErrorState error={agenda.error} onRetry={agenda.reload} />
          : agenda.loading && !agenda.data ? <Loading label="Loading your agenda" />
          : !list.length ? <Empty title="No visits on this day" art="caught-up">Patients book into your open times. New bookings appear here.</Empty>
          : (
            <ol className="card card-tight rows">
              {list.map((a) => {
                const open = a.status === 'confirmed' && phaseOf(a, now) === 'open' && a.call.state !== 'ended'
                const record = needsOutcome(a, now)
                const label = record ? 'Record outcome' : open ? 'Start visit' : 'Open visit'
                return (
                  <li key={a.id} className="grid gap-3 py-4 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center">
                    <p className="text-[20px] font-medium tabular-nums">{hhmm(a.startsAt)}<span className="fine block font-normal">until {hhmm(a.endsAt)}</span></p>
                    <div className="min-w-0">
                      <p className="font-medium">{a.patient?.displayName ?? 'Patient'} {a.patient?.kind === 'family' && <span className="fine">(booked by a parent or carer)</span>}</p>
                      <p className="fine">{a.service.groupName} · {a.service.name} · video</p>
                      <p className="mt-1 flex flex-wrap gap-2"><StatusBadge a={a} now={now} />{a.id === next?.id && <span className="badge badge-ok">Next up</span>}</p>
                    </div>
                    {a.status !== 'cancelled' && (
                      <Link to={`/doctor/visits/${a.id}`} className={`btn btn-sm ${open || record ? 'btn-primary' : 'btn-secondary'}`}>{label}<span className="sr-only"> at {hhmm(a.startsAt)}</span></Link>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
      </div>
      <p className="fine mt-6">Carevia shows operational details only. Write the clinical record, and issue anything, in iMED.</p>
    </div>
  )
}

// ---------- J13: the visit, as one guided flow: prepare, call, outcome, then iMED ----------
type Step = 'prepare' | 'call' | 'outcome' | 'imed'
const STEPS: [Step, string][] = [['prepare', 'Prepare'], ['call', 'Call'], ['outcome', 'Outcome'], ['imed', 'Write it up in iMED']]

/** Where the doctor is, read from the appointment itself, so a reload lands on the same step. */
function stepOf(a: Appointment, phase: Phase, inCall: boolean, callDone: boolean): Step {
  if (inCall) return 'call' // before the outcome check: "Ended: poor connection" can go back into the call
  if (a.outcome) return 'imed'
  if (phase === 'before') return 'prepare'
  if (phase === 'closed' || callDone || a.call.state === 'ended') return 'outcome'
  return 'call'
}

function FlowSteps({ at }: { at: Step }) {
  const i = STEPS.findIndex(([s]) => s === at)
  return (
    <nav className="stepper stepper-row mt-6" aria-label="Visit steps">
      <ol>
        {STEPS.map(([s, label], n) => (
          <li key={s} aria-current={n === i ? 'step' : undefined} className={n < i ? 'done' : undefined}>
            <span className="dot" aria-hidden="true">{n + 1}</span>{label}{n < i && <span className="sr-only"> (done)</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function DoctorVisit() {
  const { id = '' } = useParams()
  const load = useLoad(() => api.appointment(id).then((r) => r.appointment), [id])
  const day = load.data ? lisbonDay(load.data.startsAt) : ''
  const agenda = useLoad(() => (day ? api.agenda(day) : Promise.resolve(null)), [day])
  const now = useNow(15000)
  const [inCall, setInCall] = useState(false)
  const [callDone, setCallDone] = useState(false)
  const [pick, setPick] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const agendaHref = `/doctor${day && day !== lisbonDay() ? `?date=${day}` : ''}`
  if (load.error) return <div className="page-narrow"><ErrorState error={load.error} onRetry={load.reload} /><Link to="/doctor" className="link mt-4 inline-flex min-h-11 items-center">Back to your agenda</Link></div>
  if (!load.data) return <div className="page"><Loading label="Loading the visit" /></div>
  const a = load.data
  const phase = phaseOf(a, now)
  const step = stepOf(a, phase, inCall, callDone)
  // The next visit of the day that still needs the doctor, so finishing one leads straight to the next.
  const next = agenda.data?.appointments.find((x) => x.id !== a.id && x.startsAt > a.startsAt && x.status === 'confirmed' && !x.outcome)

  async function record() {
    if (!pick) return
    setPending(true)
    setError(null)
    try { load.set((await api.recordOutcome(a.id, pick)).appointment); setPick(null); setCallDone(false); agenda.reload() } catch (e) { setError((e as ApiError).message) } finally { setPending(false) }
  }
  const joinCall = () => { setCallDone(false); setInCall(true) }

  return (
    <div className="page">
      <Link to={agendaHref} className="link inline-flex min-h-11 items-center text-sm">Back to your agenda</Link>
      <div className="mt-2 grid gap-8 min-[1025px]:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <PageTitle eyebrow={`${when(a.startsAt)} · ${a.service.groupName}`} title={`Visit at ${hhmm(a.startsAt)}`}>{a.patient?.displayName ?? 'Patient'}</PageTitle>
          {a.status === 'cancelled' ? <Notice className="mt-6">This visit was cancelled.</Notice> : <>
            <FlowSteps at={step} />
            <div className="mt-5" aria-live="polite">
              {step === 'prepare' ? (
                <div className="card bg-navy text-white on-navy">
                  <p className="eyebrow">Step 1 · Prepare</p>
                  <h2 className="mt-2 text-white">The room opens at {hhmm(a.call.joinOpensAt)}</h2>
                  <p className="mt-2 text-[#c0d2e7]">That’s 10 minutes before the visit. Meanwhile, read the patient’s record in iMED.</p>
                  <OpenImed className="btn mt-5 bg-white text-ink hover:bg-mist" />
                </div>
              ) : step === 'call' && inCall ? (
                <>
                  <DailyRoom appointmentId={a.id} who="clinician" onEnded={() => { setInCall(false); setCallDone(true) }} />
                  {/* Also the way out when video is off or the call fails: the outcome must stay reachable. */}
                  <p className="fine mt-3">When you leave the call, you’ll record the outcome here. <button type="button" className="link min-h-11" onClick={() => { setInCall(false); setCallDone(true) }}>Leave and record the outcome</button></p>
                </>
              ) : step === 'call' ? (
                <div className="card bg-navy text-white on-navy">
                  <p className="eyebrow">Step 2 · Call</p>
                  <h2 className="mt-2 text-white">Start the call when you’re ready</h2>
                  <p className="mt-2 text-[#c0d2e7]">You join as the room owner. The patient joins from their waiting room.{a.call.reconnects ? ` They have reconnected ${a.call.reconnects} time${a.call.reconnects > 1 ? 's' : ''}.` : ''}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <button type="button" className="btn bg-white text-ink hover:bg-mist" onClick={joinCall}>Start the call</button>
                    <button type="button" className="link min-h-11 text-white" onClick={() => setCallDone(true)}>Patient didn’t join? Record the outcome</button>
                  </div>
                </div>
              ) : step === 'outcome' ? (
                <section className="card" aria-labelledby="outcome">
                  <p className="eyebrow">Step 3 · Outcome</p>
                  <h2 id="outcome" className="mt-2">How did the visit end?</h2>
                  <p className="muted mt-2">Choose one. Reasons and notes go in iMED, not here.</p>
                  {phase === 'closed' && <Notice className="mt-4">The join window closed at {hhmm(a.call.joinClosesAt)}.</Notice>}
                  <fieldset className="mt-5 grid gap-2">
                    <legend className="sr-only">Outcome</legend>
                    {(Object.keys(OUTCOME) as Outcome[]).map((o) => (
                      <label key={o} className="choice">
                        <input type="radio" name="outcome" value={o} checked={pick === o} onChange={() => setPick(o)} />
                        <span><span className="block font-medium">{OUTCOME[o]}</span><span className="fine">{SEES[o]}</span></span>
                      </label>
                    ))}
                  </fieldset>
                  <FormError error={error} />
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" className="btn btn-primary" disabled={!pick || pending} onClick={record}>{pending ? 'Saving…' : 'Record outcome'}</button>
                    {phase === 'open' && <button type="button" className="btn btn-secondary" onClick={joinCall}>{a.call.state === 'not_started' ? 'Start the call' : 'Rejoin the call'}</button>}
                  </div>
                </section>
              ) : (
                <section className="card" aria-labelledby="done">
                  <p className="eyebrow">Step 4 · Write it up in iMED</p>
                  <h2 id="done" className="mt-2">Outcome recorded: {a.outcome ? OUTCOME[a.outcome] : 'Completed'}</h2>
                  <p className="muted mt-2">Write the clinical record, and issue any prescription or certificate, in iMED. Carevia keeps only the outcome.</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <OpenImed className="btn btn-primary" />
                    {a.status === 'confirmed' && phase === 'open' && <button type="button" className="btn btn-secondary" onClick={joinCall}>Start the call again</button>}
                    {next
                      ? <Link to={`/doctor/visits/${next.id}`} className="btn btn-secondary">Next visit at {hhmm(next.startsAt)}</Link>
                      : <Link to={agendaHref} className="btn btn-secondary">Back to your agenda</Link>}
                  </div>
                  {next && <p className="fine mt-3">Next: {next.patient?.displayName ?? 'Patient'} · {next.service.name}</p>}
                </section>
              )}
            </div>
          </>}
        </section>
        <aside className="grid content-start gap-3" aria-label="Visit details">
          <div className="card card-tight">
            <dl className="summary">
              <dt>Patient</dt><dd>{a.patient?.displayName}{a.patient?.kind === 'family' && <span className="fine block">Booked by a parent or carer, who joins with them</span>}</dd>
              <dt>Service</dt><dd>{a.service.name}</dd>
              <dt>Time</dt><dd>{hhmm(a.startsAt)} to {hhmm(a.endsAt)}</dd>
              <dt>Status</dt><dd><StatusBadge a={a} now={now} /></dd>
              {a.preJoin?.companion && <><dt>Companion</dt><dd>The patient asked to be accompanied</dd></>}
            </dl>
            <div className="flex items-center gap-3 border-t border-line pt-3"><DoctorAvatar doctor={a.doctor} size={36} /><span className="fine">{a.doctor.name} · {a.doctor.cedula}</span></div>
          </div>
          {step !== 'imed' && step !== 'prepare' && <OpenImed className="btn btn-secondary btn-block" />}
        </aside>
      </div>
    </div>
  )
}

// ---------- The doctor's profile, with the open times patients can book ----------
export function DoctorProfile() {
  const load = useLoad(() => api.schedule(), [])
  const [busy, setBusy] = useState<number | 'add' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState(() => addDays(lisbonDay(), 1))
  const [time, setTime] = useState('09:00')

  if (load.error) return <div className="page-narrow"><ErrorState error={load.error} onRetry={load.reload} /></div>
  if (!load.data) return <div className="page"><Loading label="Loading your profile" /></div>
  const { doctor: d, slots, days: span } = load.data
  // Put a changed or new time in place, keeping the list in time order.
  const put = (s: OwnSlot) => load.set({ ...load.data!, slots: [...slots.filter((x) => x.id !== s.id), s].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) })
  const byDay = new Map<string, OwnSlot[]>()
  for (const s of slots) byDay.set(lisbonDay(s.startsAt), [...(byDay.get(lisbonDay(s.startsAt)) ?? []), s])
  const days = [...byDay]
  const open = slots.filter((s) => s.open && !s.booked).length
  const booked = slots.filter((s) => s.booked).length
  const today = lisbonDay(), last = addDays(today, span - 1)

  async function run(key: number | 'add', fn: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try { await fn() } catch (e) { setError((e as ApiError).message) } finally { setBusy(null) }
  }
  const toggle = (s: OwnSlot) => run(s.id, async () => {
    if (s.open) { await api.closeSlot(s.id); put({ ...s, open: false }) } else put((await api.openSlot(lisbonDay(s.startsAt), hhmm(s.startsAt))).slot)
  })
  const add = () => run('add', async () => { put((await api.openSlot(date, time)).slot) })

  return (
    <div className="page">
      <Link to="/doctor" className="link inline-flex min-h-11 items-center text-sm">Back to your agenda</Link>
      <div className="mt-2 grid gap-8 min-[1025px]:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="times">
          <PageTitle eyebrow={`${d.specialty} · Cédula ${d.cedula}`} title="Your profile" lede="Patients book into the times you leave open. Tap a time to open or remove it. Booked times stay until the visit.">{d.name}</PageTitle>
          <h2 id="times" className="mt-8">Your open times</h2>
          <p className="fine mt-1" aria-live="polite">{open} open · {booked} booked · next {span} days, Lisbon time. Dark times are open, white ones removed.</p>
          <FormError error={error} />
          <form className="card card-tight mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); add() }}>
            <Field label="Day" type="date" value={date} min={today} max={last} required onChange={(e) => setDate(e.target.value)} className="w-48" />
            <Field label="Start time" type="time" step={300} value={time} required onChange={(e) => setTime(e.target.value)} className="w-36" />
            <button type="submit" className="btn btn-primary" disabled={busy === 'add'}>{busy === 'add' ? 'Adding…' : 'Add a time'}</button>
            <p className="fine basis-full">Visits last 30 minutes, so a new time can’t overlap an open one.</p>
          </form>
          {!days.length ? <div className="mt-4"><Empty title="No times on your schedule" art="caught-up">Add a time above and patients can book it.</Empty></div> : (
            <ol className="card card-tight rows mt-4">
              {days.map(([day, list]) => (
                <li key={day} className="grid gap-3 py-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
                  <p className="font-medium">{relDay(list[0].startsAt)}<span className="fine block font-normal">{shortDate(list[0].startsAt)}</span></p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`Times on ${shortDate(list[0].startsAt)}`}>
                    {list.map((s) => (
                      <button key={s.id} type="button" className={`chip tabular-nums ${s.booked ? 'chip-booked' : ''}`} aria-pressed={s.booked ? undefined : s.open} disabled={s.booked || busy === s.id}
                        title={s.booked ? 'Booked: it stays on your schedule' : s.open ? 'Open: tap to remove' : 'Removed: tap to open'}
                        onClick={() => toggle(s)}>
                        {hhmm(s.startsAt)}{s.booked ? <span className="ml-1.5 text-[13px] opacity-80">Booked</span> : <span className="sr-only">{s.open ? ', open' : ', removed'}</span>}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="fine mt-4">New weeks follow your usual pattern. Times you remove stay removed.</p>
        </section>
        <aside className="grid content-start gap-3" aria-label="Profile details">
          <div className="card card-tight">
            <div className="flex items-center gap-3 pb-3"><DoctorAvatar doctor={d} size={52} /><span><span className="block font-medium">{d.name}</span><span className="fine">{d.groupName}</span></span></div>
            <dl className="summary border-t border-line pt-3">
              <dt>Specialty</dt><dd>{d.specialty}</dd>
              <dt>Cédula profissional</dt><dd>{d.cedula}</dd>
              <dt>Languages</dt><dd>{d.languages}</dd>
              <dt>Service</dt><dd>{d.service} · {euro(d.fee)}</dd>
              {d.experience && <><dt>Experience</dt><dd>{d.experience}</dd></>}
              {d.education && <><dt>Training</dt><dd>{d.education}</dd></>}
            </dl>
            <Link to={`/book/doctors/${d.id}`} className="btn btn-secondary btn-block">See what patients see</Link>
          </div>
          <p className="fine">To change these details, contact the Carevia team. Your clinical records stay in iMED.</p>
        </aside>
      </div>
    </div>
  )
}

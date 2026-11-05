import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { useLoad, useNow } from '../lib/load'
import { addDays, dayLabel, hhmm, lisbonDay, when } from '../lib/time'
import type { Appointment, Outcome } from '../lib/types'
import { Dialog, DoctorAvatar, Empty, ErrorState, Field, FormError, Loading, Notice, PageTitle } from '../ui/kit'
import { DailyRoom } from './call'
import { phaseOf } from './visit'

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

function StatusBadge({ a }: { a: Appointment }) {
  if (a.status === 'cancelled') return <span className="badge">Cancelled</span>
  if (a.outcome) return <span className={`badge ${a.outcome === 'completed' ? 'badge-ok' : 'badge-warn'}`}>{OUTCOME[a.outcome]}</span>
  if (a.call.state === 'in_progress') return <span className="badge badge-ok">In call</span>
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

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <PageTitle eyebrow={d ? `${d.specialty} · Cédula ${d.cedula}` : 'Your agenda'} title="Your agenda">{d ? d.name : 'Your agenda'}</PageTitle>
        <OpenImed />
      </div>
      <div className="mt-8 flex flex-wrap items-end gap-3">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(addDays(date, -1))}>Previous day</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(lisbonDay())} disabled={date === lisbonDay()}>Today</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(addDays(date, 1))}>Next day</button>
        <Field label="Date" type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="w-48" />
      </div>
      <h2 className="mt-8" aria-live="polite">{dayLabel(`${date}T12:00:00Z`)}{dayLabel(`${date}T12:00:00Z`) === 'Today' || dayLabel(`${date}T12:00:00Z`) === 'Tomorrow' ? `, ${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}` : ''}</h2>
      <div className="mt-4">
        {agenda.error ? <ErrorState error={agenda.error} onRetry={agenda.reload} />
          : agenda.loading && !agenda.data ? <Loading label="Loading your agenda" />
          : !agenda.data!.appointments.length ? <Empty title="No visits on this day">Patients book into your open times. New bookings appear here.</Empty>
          : (
            <ol className="card card-tight rows">
              {agenda.data!.appointments.map((a) => {
                const open = a.status === 'confirmed' && phaseOf(a, now) === 'open'
                return (
                  <li key={a.id} className="grid gap-3 py-4 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center">
                    <p className="text-[20px] font-medium tabular-nums">{hhmm(a.startsAt)}<span className="fine block font-normal">until {hhmm(a.endsAt)}</span></p>
                    <div className="min-w-0">
                      <p className="font-medium">{a.patient?.displayName ?? 'Patient'} {a.patient?.kind === 'family' && <span className="fine">(booked by a parent or carer)</span>}</p>
                      <p className="fine">{a.service.groupName} · {a.service.name} · video</p>
                      <p className="mt-1"><StatusBadge a={a} /></p>
                    </div>
                    {a.status !== 'cancelled' && (
                      <Link to={`/doctor/visits/${a.id}`} className={`btn btn-sm ${open ? 'btn-primary' : 'btn-secondary'}`}>{open ? 'Start visit' : 'Open visit'}<span className="sr-only"> at {hhmm(a.startsAt)}</span></Link>
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

// ---------- J13: the visit room, as owner, plus outcome ----------
export function DoctorVisit() {
  const { id = '' } = useParams()
  const load = useLoad(() => api.appointment(id).then((r) => r.appointment), [id])
  const now = useNow(15000)
  const [inCall, setInCall] = useState(false)
  const [confirm, setConfirm] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (load.error) return <div className="page-narrow"><ErrorState error={load.error} onRetry={load.reload} /><Link to="/doctor" className="link mt-4 inline-flex min-h-11 items-center">Back to your agenda</Link></div>
  if (!load.data) return <div className="page"><Loading label="Loading the visit" /></div>
  const a = load.data
  const phase = phaseOf(a, now)
  // The API accepts an outcome while the visit is confirmed and the room has opened.
  const canRecord = a.status === 'confirmed' && phase !== 'before'

  async function record() {
    if (!confirm) return
    setPending(true)
    setError(null)
    try { load.set((await api.recordOutcome(a.id, confirm)).appointment); setConfirm(null); setInCall(false) } catch (e) { setError((e as ApiError).message) } finally { setPending(false) }
  }

  return (
    <div className="page">
      <Link to={`/doctor${lisbonDay(a.startsAt) === lisbonDay() ? '' : `?date=${lisbonDay(a.startsAt)}`}`} className="link inline-flex min-h-11 items-center text-sm">Back to your agenda</Link>
      <div className="mt-2 grid gap-8 min-[1025px]:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <PageTitle eyebrow={`${when(a.startsAt)} · ${a.service.groupName}`} title={`Visit at ${hhmm(a.startsAt)}`}>{a.patient?.displayName ?? 'Patient'}</PageTitle>
          <div className="mt-6">
            {inCall ? <DailyRoom appointmentId={a.id} who="clinician" onEnded={() => setInCall(false)} />
              : a.status === 'cancelled' ? <Notice>This visit was cancelled.</Notice>
              : phase === 'before' ? <Notice>The room opens at {hhmm(a.call.joinOpensAt)}, 10 minutes before the visit.</Notice>
              : phase === 'closed' ? <Notice>The join window closed at {hhmm(a.call.joinClosesAt)}.</Notice>
              : a.status === 'confirmed' ? (
                <div className="card bg-navy text-white on-navy">
                  <p className="eyebrow">Video room</p>
                  <h2 className="mt-2 text-white">Start the call when you’re ready</h2>
                  <p className="mt-2 text-[#c0d2e7]">You join as the room owner. The patient joins from their waiting room.{a.call.reconnects ? ` They have reconnected ${a.call.reconnects} time${a.call.reconnects > 1 ? 's' : ''}.` : ''}</p>
                  <button type="button" className="btn mt-5 bg-white text-ink hover:bg-mist" onClick={() => setInCall(true)}>Start the call</button>
                </div>
              ) : <Notice tone="ok">Outcome recorded: {a.outcome ? OUTCOME[a.outcome] : 'Completed'}.</Notice>}
          </div>
        </section>
        <aside className="grid content-start gap-3" aria-label="Visit details">
          <div className="card card-tight">
            <dl className="summary">
              <dt>Patient</dt><dd>{a.patient?.displayName}{a.patient?.kind === 'family' && <span className="fine block">Booked by a parent or carer, who joins with them</span>}</dd>
              <dt>Service</dt><dd>{a.service.name}</dd>
              <dt>Time</dt><dd>{hhmm(a.startsAt)} to {hhmm(a.endsAt)}</dd>
              <dt>Status</dt><dd><StatusBadge a={a} /></dd>
              {a.preJoin?.companion && <><dt>Companion</dt><dd>The patient asked to be accompanied</dd></>}
            </dl>
            <div className="flex items-center gap-3 border-t border-line pt-3"><DoctorAvatar doctor={a.doctor} size={36} /><span className="fine">{a.doctor.name} · {a.doctor.cedula}</span></div>
          </div>
          <OpenImed className="btn btn-secondary btn-block" />
          {canRecord && (
            <section className="card card-tight" aria-labelledby="outcome">
              <h2 id="outcome" className="font-sans text-[18px] font-medium">Outcome</h2>
              <p className="fine mt-1">Choose one. Reasons and notes go in iMED, not here.</p>
              <div className="mt-3 grid gap-2">
                {(Object.keys(OUTCOME) as Outcome[]).map((o) => (
                  <button key={o} type="button" className={`btn btn-block ${a.outcome === o ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={a.outcome === o} onClick={() => setConfirm(o)}>{OUTCOME[o]}</button>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm ? `Record “${OUTCOME[confirm]}”?` : ''}>
        <p>{confirm === 'ended_poor_quality'
          ? 'The appointment stays open, so the patient can rejoin or be offered a new time. They aren’t charged again.'
          : confirm === 'needs_in_person'
            ? 'The patient will see that you advise an in-person visit. Record your reasons in iMED.'
            : confirm === 'no_show' ? 'The patient will see that the call didn’t connect.' : 'The patient will see that the visit is complete.'}</p>
        <FormError error={error} />
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={record}>{pending ? 'Saving…' : 'Record outcome'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      </Dialog>
    </div>
  )
}

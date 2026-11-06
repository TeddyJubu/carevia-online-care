import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'
import { useLoad, useNow, type Load } from '../lib/load'
import { fullDate, hhmm, minutes } from '../lib/time'
import type { Appointment } from '../lib/types'
import { DoctorAvatar, Empty, ErrorState, Loading, PageTitle, Still } from '../ui/kit'

/** What the list says about a visit. The join window (10 min before to 60 min after) is "check-in open". */
function visitStatus(a: Appointment, now: number): [label: string, tone: string] {
  if (a.status === 'cancelled') return ['Cancelled', '']
  if (a.outcome === 'needs_in_person') return ['In-person care advised', 'badge-warn']
  if (a.outcome === 'no_show') return ['Missed', 'badge-danger']
  if (a.outcome === 'ended_poor_quality') return ['Call ended early', 'badge-warn']
  if (a.status === 'completed' || a.outcome === 'completed') return ['Completed', 'badge-ok']
  if (now < Date.parse(a.call.joinOpensAt)) return ['Scheduled', '']
  return now < Date.parse(a.call.joinClosesAt) ? ['Check-in open', 'badge-ok'] : ['Awaiting outcome', '']
}

/**
 * TEMPORARY, for testing and client demos only (needs a demo build and DEMO_MODE=true on the API).
 * Moves the visit to start now and opens the call, skipping the wait for the join window.
 * Delete this, api.testJoin and POST /api/appointments/:id/test-join before real patients use the service.
 */
function TestJoinButton({ id }: { id: string }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')
  const join = async () => {
    setBusy(true)
    setFailed('')
    try {
      await api.testJoin(id)
      navigate(`/visits/${id}/call`)
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not start the test call.')
      setBusy(false)
    }
  }
  return (
    <span className="relative grid justify-self-start sm:justify-self-end">
      <span className="absolute -top-2 -right-2 z-10 rounded-full bg-amber-400 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-black">Test only</span>
      <button type="button" className="btn btn-sm border-2 border-dashed border-amber-400" onClick={join} disabled={busy} title="Temporary test button: joins the video call now, ignoring the visit time">
        {busy ? 'Joining…' : 'Join now (test)'}
      </button>
      {failed && <span role="alert" className="fine mt-1 text-red-600">{failed}</span>}
    </span>
  )
}

function Row({ a, now }: { a: Appointment; now: number }) {
  const [label, tone] = visitStatus(a, now)
  const demo = useDemo()
  const forWhom = a.patient?.kind === 'family' ? a.patient.displayName : 'you'
  return (
    <li className="appt-row grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[150px_minmax(0,1fr)_auto_auto] sm:items-center">
      <time dateTime={a.startsAt} className="grid">
        <span className="font-medium">{fullDate(a.startsAt)}</span>
        <span className="fine">{hhmm(a.startsAt)} · {minutes(a.startsAt, a.endsAt)} min</span>
      </time>
      <span className="flex min-w-0 items-center gap-3">
        <DoctorAvatar doctor={a.doctor} size={40} />
        <span className="min-w-0">
          <Link to={`/visits/${a.id}`} className="link font-medium">{a.service.name}<span className="sr-only">, {fullDate(a.startsAt)} at {hhmm(a.startsAt)}</span></Link>
          <span className="fine block">{a.doctor.name} · For {forWhom}</span>
        </span>
      </span>
      <span className={`badge ${tone} justify-self-start`}>{label}</span>
      {demo && a.status === 'confirmed' ? <TestJoinButton id={a.id} /> : <span />}
    </li>
  )
}

function List({ title, load, now, empty }: { title: string; load: Load<{ appointments: Appointment[] }>; now: number; empty: ReactNode }) {
  const id = `appts-${title.toLowerCase()}`
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="mb-4">{title}</h2>
      {load.error ? <ErrorState error={load.error} onRetry={load.reload} title={`We couldn’t load your ${title.toLowerCase()} visits`} />
        : !load.data ? <Loading label={`Loading ${title.toLowerCase()} visits`} lines={2} />
        : load.data.appointments.length === 0 ? empty
        : <ul className="card rows appt-list p-0">{load.data.appointments.map((a) => <Row key={a.id} a={a} now={now} />)}</ul>}
    </section>
  )
}

// /app/appointments: every visit on this account, the account holder's and family members', each linking to its detail page.
export function AppointmentsPage() {
  const now = useNow(30000)
  const upcoming = useLoad(() => api.appointments('upcoming'), [])
  const past = useLoad(() => api.appointments('past'), [])
  const book = <Link to="/book" className="btn btn-primary btn-sm">Book new care</Link>
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle lede="Your visits and your family’s, booked on this account.">Appointments</PageTitle>
        <Link to="/book" className="btn btn-primary">Book new care</Link>
      </div>
      <List title="Upcoming" load={upcoming} now={now} empty={
        <Empty title="No upcoming visits" image={<Still name="empty-no-visits" className="aspect-[3/2]" />} action={book}>
          When you book a visit, it appears here with everything you need to get ready.
        </Empty>} />
      <List title="Past" load={past} now={now} empty={<Empty title="No past visits yet" art="caught-up">Visits you’ve had will be listed here.</Empty>} />
    </>
  )
}

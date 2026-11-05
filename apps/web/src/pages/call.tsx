import { useCallback, useEffect, useRef, useState } from 'react'
import type { DailyCall } from '@daily-co/daily-js'
import { Link, useNavigate } from 'react-router'
import { api, ApiError } from '../lib/api'
import { useNow } from '../lib/load'
import { useQuestions } from '../lib/questions'
import { hhmm } from '../lib/time'
import { Dialog, ErrorState, Notice, Still } from '../ui/kit'
import { phaseOf, useAppointment, VisitGate } from './visit'

type State = { kind: 'loading' } | { kind: 'error'; error: ApiError } | { kind: 'joined'; since: number } | { kind: 'dropped' }

/**
 * Daily Prebuilt embedded in Carevia. The server issues a short-lived token (owner for the doctor, not for
 * the patient); no name or other identifier is sent to Daily from here. A drop keeps the same appointment:
 * the patient rejoins with a fresh token while the join window is open.
 */
export function DailyRoom({ appointmentId, who, onEnded, onJoined }: { appointmentId: string; who: 'patient' | 'clinician'; onEnded: () => void; onJoined?: (at: number) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const call = useRef<DailyCall | null>(null)
  const dropped = useRef(false)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [unstable, setUnstable] = useState(false)
  const ended = useRef(onEnded)
  ended.current = onEnded

  const start = useCallback(async () => {
    setState({ kind: 'loading' })
    dropped.current = false
    try {
      const { token, url } = await api.videoToken(appointmentId)
      const Daily = (await import('@daily-co/daily-js')).default
      await call.current?.destroy()
      await Daily.getCallInstance()?.destroy()
      if (!host.current) return
      const frame = Daily.createFrame(host.current, {
        showLeaveButton: true,
        showFullscreenButton: true,
        iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '14px', background: '#061c3a' },
      })
      call.current = frame
      frame.on('joined-meeting', () => { const at = Date.now(); setState({ kind: 'joined', since: at }); onJoined?.(at); void api.callEvent(appointmentId, 'joined').catch(() => {}) })
      frame.on('network-connection', (e) => setUnstable(e?.event === 'interrupted'))
      frame.on('error', () => { dropped.current = true; setState({ kind: 'dropped' }); void api.callEvent(appointmentId, 'error').catch(() => {}) })
      frame.on('left-meeting', () => {
        if (dropped.current) return
        void api.callEvent(appointmentId, 'left').catch(() => {})
        ended.current()
      })
      await frame.join({ url, token })
    } catch (e) {
      if (e instanceof ApiError) setState({ kind: 'error', error: e })
      else { dropped.current = true; setState({ kind: 'dropped' }) }
    }
  }, [appointmentId])

  useEffect(() => {
    void start()
    return () => { void call.current?.destroy(); call.current = null }
  }, [start])

  const rejoin = async () => {
    await api.callEvent(appointmentId, 'reconnect').catch(() => {})
    void start()
  }

  if (state.kind === 'error') return <CallError error={state.error} who={who} appointmentId={appointmentId} onRetry={start} />
  return (
    <div className="relative">
      <div aria-live="polite">
        {unstable && state.kind === 'joined' && <Notice tone="warn" className="mb-3">Your connection is unstable. Reconnecting…</Notice>}
        {state.kind === 'dropped' && (
          <Notice tone="warn" className="mb-3">
            <span className="grid gap-3">
              <span><strong className="font-medium">The call dropped.</strong> Your appointment is still open. Rejoin while the visit is running.</span>
              <button type="button" className="btn btn-primary btn-sm justify-self-start" onClick={rejoin}>Rejoin the call</button>
            </span>
          </Notice>
        )}
      </div>
      <div ref={host} className="h-[min(70svh,720px)] min-h-[420px] overflow-hidden rounded-[14px] bg-navy-3" aria-label="Video call" role="region" />
      {state.kind === 'loading' && <div className="absolute inset-0 grid place-items-center text-white"><span className="inline-flex items-center gap-3"><span className="spinner border-white/30 border-t-white" aria-hidden="true" /><span role="status">Connecting to the call…</span></span></div>}
    </div>
  )
}

function CallError({ error, who, appointmentId, onRetry }: { error: ApiError; who: 'patient' | 'clinician'; appointmentId: string; onRetry: () => void }) {
  if (error.code === 'VIDEO_DISABLED') return <VideoOff who={who} />
  const back = who === 'patient' ? `/visits/${appointmentId}` : '/doctor'
  if (error.code === 'TOO_EARLY')
    return <div className="card"><h2>It’s a little early</h2><p className="muted mt-2">{error.message}</p><Link to={who === 'patient' ? `/visits/${appointmentId}/waiting` : '/doctor'} className="btn btn-primary mt-4">{who === 'patient' ? 'Go to the waiting room' : 'Back to your agenda'}</Link></div>
  if (error.code === 'WINDOW_CLOSED')
    return <div className="card"><h2>The time to join has passed</h2><p className="muted mt-2">Your appointment isn’t lost. {who === 'patient' ? 'See what happens next.' : 'Record the outcome below.'}</p>{who === 'patient' && <Link to={`/visits/${appointmentId}/done`} className="btn btn-primary mt-4">What happens next</Link>}</div>
  if (error.code === 'NOT_CONFIRMED')
    return <div className="card"><h2>This visit isn’t open for a call</h2><p className="muted mt-2">{error.message}</p><Link to={back} className="btn btn-primary mt-4">Back</Link></div>
  if (error.code === 'DAILY_ERROR')
    return <div><ErrorState error={{ message: 'The video service didn’t respond. Your appointment is kept. Try again in a moment.' }} onRetry={onRetry} title="We couldn’t start the video" /></div>
  if (error.code === 'PRE_JOIN_REQUIRED')
    return <div className="card"><h2>Confirm it’s you first</h2><p className="muted mt-2">{error.message}</p><Link to={`/visits/${appointmentId}/join`} className="btn btn-primary mt-4">Confirm your details</Link></div>
  return <div><ErrorState error={error} onRetry={onRetry} title="We couldn’t start the call" /><Link to={back} className="link mt-4 inline-flex min-h-11 items-center">Back</Link></div>
}

export function VideoOff({ who }: { who: 'patient' | 'clinician' }) {
  return (
    <div className="card overflow-hidden bg-navy p-0 text-white on-navy" role="status">
      <Still name="empty-video-off" className="aspect-[5/2]" />
      <div className="p-6">
      <p className="eyebrow">Video is off</p>
      <h2 className="mt-2 text-white">Video calls aren’t switched on right now</h2>
      <p className="mt-3 text-[#c0d2e7]">
        {who === 'patient'
          ? 'Your appointment is kept and nothing has been lost. Please try again in a few minutes. If video stays off, your visit isn’t lost and you won’t pay again: your doctor will mark the call as ended, and you can then choose a new time from your account.'
          : 'Add the Daily API key in the admin app’s Daily settings. Video stays off until a key is saved.'}
      </p>
      </div>
    </div>
  )
}

function Questions({ id }: { id: string }) {
  const [list, save] = useQuestions(id)
  return (
    <section aria-labelledby="qs" className="card card-mist h-full">
      <h2 id="qs" className="font-sans text-[18px] font-medium">Your questions</h2>
      {list.length ? (
        <ul className="mt-2">
          {list.map((q, i) => (
            <li key={i}><label className="check"><input type="checkbox" checked={q.done} onChange={(e) => save(list.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} /><span className={q.done ? 'line-through opacity-70' : ''}>{q.text}</span></label></li>
          ))}
        </ul>
      ) : <p className="fine mt-2">You didn’t add any. That’s fine: just talk.</p>}
      <p className="fine mt-4">Only you can see this list. It stays on this device.</p>
    </section>
  )
}

function Elapsed({ since }: { since: number }) {
  const now = useNow()
  const s = Math.max(0, Math.floor((now - since) / 1000))
  return <span className="tabular-nums">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>
}

function CompanionInvite({ id }: { id: string }) {
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  return (
    <div className="card card-tight">
      <p className="font-medium">Companion</p>
      {link ? (
        <>
          <p className="fine mt-1">Send this private link to your companion. It works for this visit only.</p>
          <input readOnly value={link} className="input mt-2 text-sm" aria-label="Companion link" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy link'}</button>
        </>
      ) : (
        <>
          <p className="fine mt-1">Joining from another device? Get a private link for them.</p>
          <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={async () => {
            try { const t = await api.videoToken(id, true); setLink(`${t.url}?t=${t.token}`) } catch (e) { setError((e as ApiError).message) }
          }}>Get a companion link</button>
          {error && <p className="field-error mt-2" role="alert">{error}</p>}
        </>
      )}
    </div>
  )
}

// ---------- J10: the video consultation ----------
export function CallPage() {
  const load = useAppointment()
  const navigate = useNavigate()
  const [qOpen, setQOpen] = useState(false)
  const [joinedAt, setJoinedAt] = useState<number>() // when Daily says we're in, not when the page opened
  return (
    <VisitGate load={load}>{(a) => {
      const qs = JSON.parse(localStorage.getItem(`carevia-questions-${a.id}`) ?? '[]').length as number
      if (a.status !== 'confirmed' || phaseOf(a) === 'closed') {
        return <div className="page-narrow"><h1>This call isn’t open</h1><p className="lede mt-4">See the visit for what happens next.</p><Link to={`/visits/${a.id}/done`} className="btn btn-primary mt-6">Visit status</Link></div>
      }
      return (
        <div className="page pt-6">
          <h1 className="sr-only">Video consultation with {a.doctor.name}</h1>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p><span className="font-medium">{a.doctor.name}</span> <span className="muted">· {a.doctor.specialty} · Cédula {a.doctor.cedula}</span></p>
            {joinedAt && <p className="fine">Started {hhmm(new Date(joinedAt).toISOString())} · <Elapsed since={joinedAt} /></p>}
          </div>
          <div className="grid gap-4 min-[1025px]:grid-cols-[minmax(0,1fr)_300px]">
            <DailyRoom appointmentId={a.id} who="patient" onJoined={setJoinedAt} onEnded={() => navigate(`/visits/${a.id}/done`)} />
            <div className="hidden content-start gap-3 min-[1025px]:grid">
              <Questions id={a.id} />
              {a.preJoin?.companion && <CompanionInvite id={a.id} />}
              <p className="fine">Not an emergency service. In an emergency, call <a href="tel:112" className="link">112</a>.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 min-[1025px]:hidden">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQOpen(true)}>Your questions ({qs})</button>
            {a.preJoin?.companion && <CompanionInvite id={a.id} />}
          </div>
          <Dialog open={qOpen} onClose={() => setQOpen(false)} title="Your questions"><Questions id={a.id} /></Dialog>
        </div>
      )
    }}</VisitGate>
  )
}


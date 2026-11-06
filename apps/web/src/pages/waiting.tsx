import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { useLoad, useNow } from '../lib/load'
import { readQuestions } from '../lib/questions'
import { countdown, hhmm } from '../lib/time'
import { Notice, PageTitle, Still } from '../ui/kit'
import { VideoOff } from './call'
import { phaseOf, useAppointment, VisitGate } from './visit'

type Check = 'idle' | 'checking' | 'ok' | 'problem'
type MediaProblem = { title: string; steps: ReactNode }

function explain(e: unknown): MediaProblem {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return {
    title: 'Your browser blocked the camera and microphone',
    steps: (
      <ul className="mt-2 list-disc pl-5">
        <li>On a computer: click the camera or lock icon in the address bar, choose <strong className="font-medium">Allow</strong> for camera and microphone, then try again.</li>
        <li>On iPhone or iPad: open Settings, then Safari, then Camera and Microphone, and choose <strong className="font-medium">Allow</strong>.</li>
        <li>On Android: tap the lock icon next to the address, then Permissions, and allow camera and microphone.</li>
      </ul>
    ),
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { title: 'We couldn’t find a camera or microphone', steps: <p className="mt-2">Plug in a headset or webcam, or switch to a phone or laptop with a camera.</p> }
  if (name === 'NotReadableError' || name === 'AbortError') return { title: 'Another app is using your camera', steps: <p className="mt-2">Close other video apps (Zoom, Teams, FaceTime), then try again.</p> }
  return { title: 'This browser can’t use the camera here', steps: <p className="mt-2">Use an up-to-date Chrome, Safari, Edge or Firefox.</p> }
}

/** Camera preview, microphone level, a speaker test tone and a connection check. Nothing is recorded or sent. */
function useDeviceCheck() {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const audio = useRef<AudioContext | null>(null)
  const [camera, setCamera] = useState<Check>('idle')
  const [mic, setMic] = useState<Check>('idle')
  const [level, setLevel] = useState(0)
  const [problem, setProblem] = useState<MediaProblem | null>(null)

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    void audio.current?.close().catch(() => {})
    audio.current = null
  }, [])

  const start = useCallback(async () => {
    stop()
    setProblem(null)
    setCamera('checking'); setMic('checking')
    if (!navigator.mediaDevices?.getUserMedia) { setProblem(explain(null)); setCamera('problem'); setMic('problem'); return }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      stream.current = s
      if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}) }
      setCamera(s.getVideoTracks().some((t) => t.readyState === 'live') ? 'ok' : 'problem')
      const ctx = new AudioContext()
      audio.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(s).connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      let heard = false
      const tick = () => {
        if (audio.current !== ctx) return
        analyser.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        const l = Math.min(1, peak / 64)
        setLevel(l)
        if (!heard && l > 0.08) { heard = true; setMic('ok') }
        requestAnimationFrame(tick)
      }
      tick()
    } catch (e) {
      setProblem(explain(e))
      setCamera('problem'); setMic('problem')
    }
  }, [stop])

  useEffect(() => { void start(); return stop }, [start, stop])
  // The <video> may mount after the stream exists (the visit loads in parallel), so attach on mount too.
  const attach = useCallback((el: HTMLVideoElement | null) => {
    video.current = el
    if (el && stream.current && el.srcObject !== stream.current) { el.srcObject = stream.current; void el.play().catch(() => {}) }
  }, [])
  return { attach, camera, mic, level, problem, start }
}

function playTone() {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = 523
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 1.25)
  osc.onended = () => void ctx.close()
}

const LABEL: Record<Check, string> = { idle: 'Not checked', checking: 'Checking…', ok: 'Working', problem: 'Needs attention' }

function Row({ name, state, children }: { name: string; state: Check; children?: ReactNode }) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <span>{name}</span>
        <span className={`badge ${state === 'ok' ? 'badge-ok' : state === 'problem' ? 'badge-warn' : ''}`}>{LABEL[state]}</span>
      </div>
      {children}
    </div>
  )
}

// ---------- J9: device check and waiting room ----------
export function Waiting() {
  const load = useAppointment()
  const navigate = useNavigate()
  const now = useNow()
  const dev = useDeviceCheck()
  const [speaker, setSpeaker] = useState<Check>('idle')
  const [askedHeard, setAskedHeard] = useState(false)
  const video = useLoad(async () => {
    const t0 = performance.now()
    const { enabled } = await api.videoStatus()
    return { enabled, ms: performance.now() - t0 }
  }, [])
  const connection: Check = !navigator.onLine ? 'problem' : video.loading ? 'checking' : video.error ? 'problem' : video.data!.ms < 1500 ? 'ok' : 'problem'

  return (
    <VisitGate load={load}>{(a) => {
      const phase = phaseOf(a, now)
      const qs = readQuestions(a.id).length
      const ready = a.preJoin?.confirmedAt
      return (
        <div className="page">
          <div className="grid gap-8 min-[1025px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section aria-label="Your camera">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-navy-3 max-[1024px]:aspect-video">
                <video ref={dev.attach} muted playsInline className="size-full -scale-x-100 object-cover" aria-label="Your camera preview" />
                {dev.camera !== 'ok' && <Still name="waiting-room" className="absolute inset-0 h-full opacity-60" />}
                {dev.camera !== 'ok' && <p className="absolute inset-0 grid place-items-center p-6 text-center text-white [text-shadow:0_1px_8px_#061c3a]">{dev.camera === 'checking' ? 'Asking for your camera…' : 'Your camera preview appears here'}</p>}
                <span className="absolute bottom-3 left-3 rounded-full bg-navy/70 px-3 py-1 text-sm text-white">Only you see this preview</span>
              </div>
              <div aria-live="polite">
                {dev.problem && (
                  <Notice tone="warn" className="mt-4">
                    <div><p className="font-medium">{dev.problem.title}</p>{dev.problem.steps}<button type="button" className="btn btn-secondary btn-sm mt-3" onClick={dev.start}>Try again</button></div>
                  </Notice>
                )}
              </div>
            </section>

            <section>
              <PageTitle eyebrow="Waiting room" lede={phase === 'before' ? 'You’re early. That’s fine. Stay on this page.' : phase === 'open' ? 'You can join now. Your doctor will be with you shortly.' : 'The time to join has passed.'}>
                {`${a.doctor.name} will join at ${hhmm(a.startsAt)}`}
              </PageTitle>
              <div className="card card-tight mt-6 rows" aria-label="Device check">
                <Row name="Camera" state={dev.camera} />
                <Row name="Microphone" state={dev.mic}>
                  {dev.camera !== 'problem' && (
                    <>
                      <div className="meter mt-2" aria-hidden="true"><span style={{ transform: `scaleX(${dev.level})` }} /></div>
                      {dev.mic !== 'ok' && <p className="fine mt-1">Say something. The bar moves when we hear you.</p>}
                    </>
                  )}
                </Row>
                <Row name="Speaker" state={speaker}>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { playTone(); setAskedHeard(true) }}>Play a test sound</button>
                    {askedHeard && speaker !== 'ok' && (
                      <span className="flex items-center gap-2" role="group" aria-label="Did you hear it?">
                        <span className="fine">Did you hear it?</span>
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSpeaker('ok')}>Yes</button>
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSpeaker('problem')}>No</button>
                      </span>
                    )}
                  </div>
                  {speaker === 'problem' && <p className="fine mt-2">Turn the volume up, check the device isn’t muted, or plug in headphones. Then play the sound again.</p>}
                </Row>
                <Row name="Connection" state={connection}>
                  {connection === 'problem' && <p className="fine mt-1">Your internet looks slow. Move closer to your router or switch to mobile data.</p>}
                </Row>
              </div>

              <div className="card card-tight mt-3">
                <p className="font-medium">Your questions</p>
                <p className="fine">{qs ? `${qs} question${qs > 1 ? 's' : ''} saved on this device. You’ll see them beside the video.` : 'None yet.'} <Link to={`/visits/${a.id}`} className="link">{qs ? 'Edit' : 'Add some'}</Link></p>
              </div>

              {video.data && !video.data.enabled && <div className="mt-3"><VideoOff who="patient" /></div>}

              <div className="mt-6 grid gap-3">
                {!ready ? (
                  <Link to={`/visits/${a.id}/join`} className="btn btn-primary btn-block">Confirm your details to join</Link>
                ) : phase === 'before' ? (
                  <button type="button" className="btn btn-primary btn-block" disabled aria-describedby="opens">Join opens at {hhmm(a.call.joinOpensAt)}</button>
                ) : phase === 'open' ? (
                  <button type="button" className="btn btn-primary btn-block" disabled={video.data?.enabled === false} onClick={() => navigate(`/visits/${a.id}/call`)}>Join the call</button>
                ) : (
                  <Link to={`/visits/${a.id}/done`} className="btn btn-primary btn-block">What happens next</Link>
                )}
                {phase === 'before' && <p id="opens" className="fine text-center" aria-live="off">Opens in {countdown(a.call.joinOpensAt, now)}</p>}
                <p className="notice">Connection trouble? Your appointment stays open: rejoin until {hhmm(a.call.joinClosesAt)}. After that, we’ll arrange a new time.</p>
              </div>
            </section>
          </div>
        </div>
      )
    }}</VisitGate>
  )
}

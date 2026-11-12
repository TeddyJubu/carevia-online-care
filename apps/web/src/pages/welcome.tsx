import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiError } from '../lib/api'
import { useLoad } from '../lib/load'
import { euro, Field, FormError, Loading, Notice, PageTitle } from '../ui/kit'
import { Unlinked } from './doctor'

function useSetup() {
  const load = useLoad(() => api.onboarding(), [])
  return load
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="page-narrow">
      <p className="fine">Setting up · <Link className="link" to="/signin" onClick={(e) => { e.preventDefault(); api.auth.signOut().then(() => { window.location.assign('/app/signin') }) }}>Sign out</Link></p>
      {children}
    </div>
  )
}

export function Welcome() {
  const load = useSetup()
  if (load.error?.code === 'NO_DOCTOR_PROFILE') return <Unlinked />
  if (load.error) return <Shell><FormError error={load.error.message} /></Shell>
  if (!load.data) return <Shell><Loading label="Loading your setup" /></Shell>
  if (!load.data.required || load.data.complete) return <Shell><Link className="btn btn-primary" to="/doctor">Go to your agenda</Link></Shell>
  const done = load.data.steps.filter((step) => step.done).length
  const links: Record<string, string> = {
    security: '/doctor/welcome/security',
    profile: '/doctor/welcome/profile',
    agreement: '/doctor/welcome/agreement',
    hours: '/doctor/welcome/hours',
  }
  return (
    <Shell>
      <PageTitle eyebrow={`${load.data.profile?.name ?? 'Your practice'}`} lede="Five short steps. You can sign out and come back; nothing goes live until you finish.">Set up your practice</PageTitle>
      <p className="fine mt-4">Your profile is hidden from patients until the last step. {done} of {load.data.steps.length} done.</p>
      <ol className="mt-8 grid gap-4">
        {load.data.steps.map((step, i) => (
          <li key={step.key} className="card p-4">
            <p className="eyebrow">{step.done ? 'Done' : step.state === 'current' ? `Step ${i + 1}` : 'Later'}</p>
            <p className="font-medium mt-1">{step.done ? `✓ ${step.title}` : step.title}</p>
            <p className="muted mt-1">{step.detail}</p>
            {step.state === 'current' && links[step.key] ? <Link className="btn btn-primary mt-4" to={links[step.key]}>Start</Link> : null}
          </li>
        ))}
      </ol>
    </Shell>
  )
}

export function SecurityStep() {
  const load = useSetup()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  if (load.error?.code === 'NO_DOCTOR_PROFILE') return <Unlinked />
  if (!load.data) return <Shell><Loading label="Loading" /></Shell>
  const skip = () => {
    setPending(true)
    api.skipTwoFactor().then(() => navigate('/doctor/welcome')).catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.')).finally(() => setPending(false))
  }
  return (
    <Shell>
      <PageTitle eyebrow="Step 2 of 5 · Secure your account" lede="After your password, a code from an authenticator app on your phone. Required for clinician accounts.">Two checks before your first visit</PageTitle>
      <div className="card mt-8 p-6 grid gap-3">
        <p className="font-medium">Email verified</p>
        <p className="muted">Booking and cancellation emails come here. The invite already confirmed this address.</p>
      </div>
      {load.data.demo ? (
        <div className="mt-6 grid gap-4">
          <Notice>In the demo, two-factor can be skipped and the checklist says so.</Notice>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={skip}>{pending ? 'Saving…' : 'Skip two-factor for this demo'}</button>
          <FormError error={error} />
        </div>
      ) : (
        <p className="mt-6 muted">Turn on two-factor from an authenticator app before the agenda opens. This demo build is the one that can skip it.</p>
      )}
      <Link className="link mt-6 inline-flex min-h-11 items-center" to="/doctor/welcome">Back to checklist</Link>
    </Shell>
  )
}

export function ProfileStep() {
  const load = useSetup()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [flag, setFlag] = useState(false)
  const profile = load.data?.profile
  if (load.error?.code === 'NO_DOCTOR_PROFILE') return <Unlinked />
  if (!profile) return <Shell><Loading label="Loading your profile" /></Shell>
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const decision = flag ? 'flag' : 'confirm'
    const body = {
      languages: String(form.get('languages') ?? ''),
      experience: String(form.get('experience') ?? ''),
      education: String(form.get('education') ?? ''),
      decision,
      message: String(form.get('message') ?? ''),
    } as const
    api.checkProfile(body).then(() => navigate('/doctor/welcome')).catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'))
  }
  return (
    <Shell>
      <PageTitle eyebrow="Step 3 of 5 · Your public profile" lede="Your name, cédula, specialty and fee are the verified ones. They are not editable here.">This is what patients see</PageTitle>
      <div className="card mt-8 p-6 grid gap-2">
        <p className="font-sans text-[22px] font-medium">{profile.name}</p>
        <p>{profile.specialty} · Cédula {profile.cedula}</p>
        <p className="font-medium">From {euro(profile.fee)}</p>
        <p className="fine">{profile.shown ? 'Shown to patients.' : 'Hidden until you finish setup.'}</p>
      </div>
      <form className="mt-6 grid gap-5" onSubmit={send}>
        <Field label="Languages" name="languages" defaultValue={profile.languages} required />
        <Field label="Experience" name="experience" defaultValue={profile.experience} required />
        <Field as="textarea" label="Training" name="education" rows={4} defaultValue={profile.education} required />
        {flag ? <Field as="textarea" label="Message to the Carevia team" name="message" rows={3} hint="What looks wrong. Nothing clinical." required /> : null}
        <FormError error={error} />
        <div className="flex flex-wrap gap-3">
          {flag ? <button className="btn btn-primary" type="submit">Send to the team</button> : <button className="btn btn-primary" type="submit">This looks right</button>}
          <button className="btn btn-secondary" type="button" onClick={() => setFlag((value) => !value)}>{flag ? 'Cancel the flag' : 'Something is wrong'}</button>
        </div>
      </form>
      <p className="fine mt-4">Flagging an error tells the Carevia team and keeps your profile hidden until it is fixed. It does not block the rest of setup.</p>
      <Link className="link mt-4 inline-flex min-h-11 items-center" to="/doctor/welcome">Back to checklist</Link>
    </Shell>
  )
}

export function AgreementStep() {
  const load = useSetup()
  const navigate = useNavigate()
  const [ticked, setTicked] = useState<boolean[]>([])
  const [error, setError] = useState<string | null>(null)
  const agreement = load.data?.agreement
  if (load.error?.code === 'NO_DOCTOR_PROFILE') return <Unlinked />
  if (!agreement) return <Shell><Loading label="Loading" /></Shell>
  const ticks = agreement.statements.map((_, i) => ticked[i] ?? false)
  const ready = ticks.every(Boolean)
  return (
    <Shell>
      <PageTitle eyebrow="Step 4 of 5 · Clinician agreement · Draft for legal review" lede="Each line is a rule the product already enforces. The text is a draft for Carevia’s lawyer.">How we work together</PageTitle>
      <form className="mt-8 grid gap-4" onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        api.acceptAgreement(agreement.version).then(() => navigate('/doctor/welcome')).catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'))
      }}>
        {agreement.statements.map((line, i) => (
          <label key={line} className="check">
            <input type="checkbox" checked={ticks[i]} onChange={(event) => {
              const checked = event.target.checked
              setTicked((current) => agreement.statements.map((_, j) => j === i ? checked : (current[j] ?? false)))
            }} />
            <span>{line}</span>
          </label>
        ))}
        <FormError error={error} />
        <button className="btn btn-primary" disabled={!ready}>I have read and accept these</button>
      </form>
      <Link className="link mt-6 inline-flex min-h-11 items-center" to="/doctor/welcome">Back to checklist</Link>
    </Shell>
  )
}

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function HoursStep() {
  const navigate = useNavigate()
  const [days, setDays] = useState([1, 2, 3, 4, 5])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  return (
    <Shell>
      <PageTitle eyebrow="Step 5 of 5 · Your hours" lede="Patients book into open times. At least one future open time is needed to finish.">Open your first times</PageTitle>
      <form className="mt-8 grid gap-5" onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        setPending(true)
        api.openFirstHours({ from: String(form.get('from')), to: String(form.get('to')), days })
          .then(() => navigate('/doctor/welcome/device-check'))
          .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'))
          .finally(() => setPending(false))
      }}>
        <div className="flex flex-wrap gap-2">
          {WEEK.map((label, index) => (
            <label key={label} className="check">
              <input type="checkbox" checked={days.includes(index)} onChange={(event) => setDays((current) => event.target.checked ? [...current, index] : current.filter((day) => day !== index))} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="From" name="from" type="time" defaultValue="09:00" required />
          <Field label="To" name="to" type="time" defaultValue="11:00" required />
        </div>
        <p className="fine">Visits last 30 minutes. This opens those times for the next 3 weeks.</p>
        <FormError error={error} />
        <button className="btn btn-primary" disabled={pending || !days.length}>{pending ? 'Saving…' : 'Save hours'}</button>
      </form>
      <Link className="link mt-6 inline-flex min-h-11 items-center" to="/doctor/welcome">Back to checklist</Link>
    </Shell>
  )
}

export function DeviceStep() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState({ camera: false, mic: false, speaker: false })
  const all = ready.camera && ready.mic && ready.speaker
  return (
    <Shell>
      <PageTitle eyebrow="Step 5 of 5 · Your camera and microphone" lede="You, in a test. No patient can join it, and nothing is recorded.">Test them once, here</PageTitle>
      <div className="mt-8 grid gap-4">
        <video ref={videoRef} className="w-full max-h-64 rounded-[12px] bg-black" autoPlay muted playsInline />
        <button type="button" className="btn btn-secondary" onClick={async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            if (videoRef.current) videoRef.current.srcObject = stream
            setReady((current) => ({ ...current, camera: true, mic: true }))
            const ctx = new AudioContext()
            const source = ctx.createMediaStreamSource(stream)
            const analyser = ctx.createAnalyser()
            source.connect(analyser)
            const data = new Uint8Array(analyser.fftSize)
            analyser.getByteTimeDomainData(data)
            setLevel(Math.max(...data) - Math.min(...data))
          } catch {
            setError('Allow the camera and microphone in the browser, then try again.')
          }
        }}>Test camera and microphone</button>
        <p className="fine" role="status">{ready.mic ? `Microphone level ${level}.` : 'Microphone: not tested yet.'}</p>
        <button type="button" className="btn btn-secondary" onClick={() => {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          osc.frequency.value = 440
          osc.connect(ctx.destination)
          osc.start()
          osc.stop(ctx.currentTime + 0.4)
          setReady((current) => ({ ...current, speaker: true }))
        }}>Play the test sound</button>
      </div>
      <FormError error={error} />
      <button type="button" className="btn btn-primary mt-6" disabled={!all} onClick={() => {
        api.deviceChecked().then(() => navigate('/doctor/welcome/ready')).catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'))
      }}>Everything works</button>
      <p className="fine mt-4">Your clinical record opens in iMED, with iMED’s own login. Carevia never asks for that password.</p>
      <Link className="link mt-4 inline-flex min-h-11 items-center" to="/doctor/welcome">Back to checklist</Link>
    </Shell>
  )
}

export function ReadyStep() {
  const load = useSetup()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  if (load.error?.code === 'NO_DOCTOR_PROFILE') return <Unlinked />
  return (
    <Shell>
      <PageTitle eyebrow="Setup complete" lede="This turns your profile on. Patients can then book your open times. Turn it off any time from your profile.">You’re ready to see patients</PageTitle>
      <ul className="mt-8 grid gap-2">
        {(load.data?.steps ?? []).map((step) => <li key={step.key}>{step.done ? 'Done' : 'Still to do'}: {step.title}</li>)}
      </ul>
      <FormError error={error} />
      <button type="button" className="btn btn-primary mt-6" onClick={() => {
        api.goLive().then(() => navigate('/doctor')).catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'))
      }}>Start seeing patients</button>
    </Shell>
  )
}

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiError } from '../lib/api'
import { useLoad } from '../lib/load'
import { useSession } from '../lib/session'
import { lisbonDay, when } from '../lib/time'
import type { Appointment, ServiceGroup, SlotWithDoctor } from '../lib/types'
import { Emergency, ErrorState, euro, Field, FormError, HoldTimer, Loading, Markdown, Notice, PageTitle } from '../ui/kit'
import { validateSignUp } from './auth'

// Services v2: one page of services with their next times, one tap holds a time, one checkout confirms it.
// Defaults instead of questions: video, for the account holder ("Me"), the earliest doctor at each time.
// The full flow (/book) stays for someone else, another doctor or another day.

type Service = { id: number; name: string }
const SHOWN = 4

export function ServicesV2() {
  const { user } = useSession()
  const services = useLoad(() => api.services(), [])
  const [held, setHeld] = useState<Appointment>()
  const [notice, setNotice] = useState<string | null>(null)
  // A failed hold is explained in the row the patient tapped, where they are looking.
  const [rowNotice, setRowNotice] = useState<{ serviceId: number; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const staff = !!user && user.role !== 'patient'

  async function hold(slot: SlotWithDoctor, service: Service) {
    setBusy(String(slot.id))
    setNotice(null)
    setRowNotice(null)
    try {
      setHeld((await api.hold({ slotId: slot.id, serviceId: service.id, for: 'self' })).appointment)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setRowNotice({ serviceId: service.id, text: (e as ApiError).code === 'SLOT_TAKEN' ? 'Someone has just booked that time. Here are the times still free.' : (e as ApiError).message })
      setReload((n) => n + 1)
    } finally {
      setBusy(null)
    }
  }

  /** Back to the list, giving the held time back so others can book it. */
  function pickAgain(message: string | null) {
    if (held) void api.release(held.id).catch(() => {}) // already expired or released: nothing to do
    setHeld(undefined)
    setNotice(message)
    setReload((n) => n + 1)
    window.scrollTo({ top: 0 })
  }

  if (held) return <div className="page"><Checkout appt={held} pickAgain={pickAgain} /></div>

  const groups = services.data?.groups ?? []
  return (
    <div className="page">
      <PageTitle eyebrow="Book a video visit" lede="Tap a time under the care you need. We hold it for 10 minutes while you check out. Prices are per visit, with no subscription.">
        Choose a time
      </PageTitle>
      <div className="mt-6"><Emergency compact /></div>
      {staff && <Notice tone="warn" className="mt-6"><span>Doctor and admin accounts can’t book visits. Sign out, then book as a patient.</span></Notice>}
      <div role="status" aria-live="polite">{notice && <Notice tone="warn" className="mt-6"><span>{notice}</span></Notice>}</div>

      {services.error ? <div className="mt-8"><ErrorState error={services.error} onRetry={services.reload} /></div>
        : !services.data ? <div className="mt-8"><Loading label="Loading services" /></div> : (
          <>
            <nav className="mt-8 flex flex-wrap gap-2" aria-label="Areas of care">
              {groups.map((g) => <a key={g.slug} href={`#area-${g.slug}`} className="chip">{g.name}</a>)}
            </nav>
            {groups.map((g) => <Area key={g.slug} group={g} reload={reload} busy={busy} disabled={staff || busy !== null} onPick={hold} notice={rowNotice} />)}
          </>
        )}
      <p className="fine mt-10">Booking for your child or someone you care for? <Link to="/book" className="link">Use the full booking</Link>.</p>
    </div>
  )
}

function Area({ group, ...rest }: { group: ServiceGroup } & Omit<RowProps, 'group' | 'service'>) {
  return (
    <section id={`area-${group.slug}`} aria-labelledby={`h-${group.slug}`} className="mt-12 scroll-mt-[calc(var(--header-h)+16px)]">
      <h2 id={`h-${group.slug}`}>{group.name}</h2>
      <p className="muted mt-2 max-w-[60ch]">{group.blurb}</p>
      {/* These services are named after documents; booking one must not read as a promise of it (PLAN.md). */}
      {(group.slug === 'certificates' || group.slug === 'renewals') && (
        <Notice className="mt-4"><span>Your doctor decides, after assessing you, whether anything needs to be issued. Booking a visit doesn’t guarantee a certificate, a test request or a renewal. Anything issued comes through iMED.</span></Notice>
      )}
      <ul className="mt-5 grid gap-3">
        {group.services.map((s) => <ServiceRow key={s.id} group={group} service={s} {...rest} />)}
      </ul>
    </section>
  )
}

type RowProps = { group: ServiceGroup; service: Service; reload: number; busy: string | null; disabled: boolean; notice: { serviceId: number; text: string } | null; onPick: (s: SlotWithDoctor, sv: Service) => void }

function ServiceRow({ group, service, reload, busy, disabled, notice, onPick }: RowProps) {
  // Times load when the row comes near the screen: 55 services would otherwise mean 55 requests on open.
  const ref = useRef<HTMLLIElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true) }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  const times = useLoad(async () => {
    if (!near) return null
    // Several doctors often share the earliest time; show distinct times, each with its earliest-listed doctor.
    const { slots } = await api.firstAvailable({ serviceId: service.id, limit: 20 })
    const seen = new Set<string>()
    return { from: Math.min(...slots.map((s) => s.doctor.fee)), slots: slots.filter((s) => !seen.has(s.startsAt) && !!seen.add(s.startsAt)).slice(0, SHOWN) }
  }, [near, service.id, reload])

  const label = `${service.name}, times`
  return (
    <li ref={ref} className="card card-tight">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3>{service.name}</h3>
        <span className="font-medium">{times.data?.slots.length ? `From ${euro(times.data.from)}` : `From ${euro(group.fromFee)}`}</span>
      </div>
      <div role="status" aria-live="polite">{notice?.serviceId === service.id && <Notice tone="warn" className="mt-3"><span>{notice.text}</span></Notice>}</div>
      <div className="mt-3 min-h-[60px]" aria-busy={times.loading}>
        {times.error ? <p className="fine">We couldn’t load times. <button type="button" className="link min-h-11" onClick={times.reload}>Try again</button></p>
          : !times.data ? <div className="skeleton h-[60px]" aria-hidden="true" />
          : !times.data.slots.length ? <p className="fine">No free times in the next three weeks.</p>
          : (
            <ul className="flex flex-wrap gap-2" aria-label={label}>
              {times.data.slots.map((s) => (
                <li key={String(s.id)}>
                  <button type="button" className="chip h-auto min-h-[60px] flex-col items-start rounded-[12px] py-2 text-left disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled} onClick={() => onPick(s, service)}>
                    <span className="font-medium">{busy === String(s.id) ? 'Holding…' : when(s.startsAt)}</span>
                    <span className="fine">{s.doctor.name} · {euro(s.doctor.fee)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
      <Link to={`/book?service=${group.slug}`} className="link mt-2 inline-flex min-h-11 items-center text-sm">More times or choose a doctor<span className="sr-only"> for {service.name}</span></Link>
    </li>
  )
}

// ---------- checkout: details (if signed out), consent, demo payment ----------
type Errors = Record<string, string>

function Checkout({ appt, pickAgain }: { appt: Appointment; pickAgain: (message: string | null) => void }) {
  const { user, refresh } = useSession()
  const navigate = useNavigate()
  const consent = useLoad(() => api.consent(), [])
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [mainland, setMainland] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [clash, setClash] = useState(false)
  const [expired, setExpired] = useState(false)
  const [pending, setPending] = useState(false)
  const form = useRef<HTMLFormElement>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const errs: Errors = {}
    let signUp: ReturnType<typeof validateSignUp>['body'] | undefined
    const email = String(f.get('email') ?? '').trim(), password = String(f.get('password') ?? '')
    if (!user && mode === 'signup') { const v = validateSignUp(f); signUp = v.body; Object.assign(errs, v.errs) }
    if (!user && mode === 'signin') {
      if (!email) errs.email = 'Enter your email.'
      if (!password) errs.password = 'Enter your password.'
    }
    if (!mainland) errs.mainland = 'Confirm you’ll be in mainland Portugal during the visit.'
    if (!agreed) errs.agreed = 'Tick the box to agree to the consultation terms.'
    setErrors(errs)
    setError(null)
    const first = Object.keys(errs)[0]
    if (first) return form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()

    setPending(true)
    try {
      if (!user) {
        try {
          if (signUp) await api.auth.signUp(signUp)
          else if ((await api.auth.signIn(email, password)).twoFactorRedirect) {
            return setError('Your account uses two-factor sign-in. Sign in from the menu first, then book again.')
          }
        } catch (err) {
          const c = (err as ApiError).code ?? ''
          if (c === 'PASSWORD_COMPROMISED') return setErrors({ password: (err as ApiError).message })
          if (c === 'UNDERAGE') return setErrors({ dateOfBirth: (err as ApiError).message })
          if (c.startsWith('USER_ALREADY_EXISTS')) return setErrors({ email: (err as ApiError).message })
          throw err
        }
        const u = await refresh()
        if (u?.role !== 'patient') return setError('Doctor and admin accounts can’t book visits. Sign out, then book as a patient.')
      }
      // The same calls, in the same order, as the full flow: claim, patient, consent, pay.
      let a = (await api.claim(appt.id)).appointment
      if (!a.patient) a = (await api.setPatient(a.id, null)).appointment
      if (!a.consent) a = (await api.acceptConsent(a.id, consent.data!.version)).appointment
      const { appointment } = await api.pay(a.id)
      navigate(`/visits/${appointment.id}?booked=1`)
    } catch (err) {
      const x = err as ApiError
      if (x.code === 'NOT_HELD') return navigate(`/visits/${appt.id}`) // already paid, for example in another tab
      if (x.code === 'HOLD_EXPIRED') return setExpired(true)
      if (x.code === 'TIME_CLASH') setClash(true)
      if (x.code === 'CONSENT_OUTDATED') { setAgreed(false); consent.reload() }
      setError(x.code === 'PAYMENT_UNAVAILABLE' ? 'Payment isn’t available yet. Nothing has been charged. Please try again later.' : x.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="animate-[pop_0.48s_cubic-bezier(.22,1,.36,1)]">
      <PageTitle eyebrow="Check out" lede={user ? 'Agree to the terms and pay. That’s all.' : 'Add your details, agree to the terms and pay. Your account is made as you pay.'}>Confirm your visit</PageTitle>
      <div className="mt-6"><Emergency compact /></div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <aside className="card lg:sticky lg:top-[calc(var(--header-h)+16px)] lg:order-2" aria-label="Your visit">
          <dl className="summary">
            <dt>Care</dt><dd><span className="font-medium">{appt.service.groupName}</span><br />{appt.service.name}</dd>
            <dt>Doctor and time</dt><dd><span className="font-medium">{when(appt.startsAt)}</span><br />{appt.doctor.name}</dd>
            <dt>Consultation</dt><dd>Video, in your browser</dd>
            <dt>For</dt><dd>Me</dd>
            <dt>Recording</dt><dd>Off. Visits are not recorded.</dd>
          </dl>
          <hr className="rule" />
          <p className="mt-3 flex items-baseline justify-between"><span>Total</span><span className="text-[22px] font-medium">{euro(appt.fee)}</span></p>
          {appt.holdExpiresAt && <p className="mt-3 flex items-center justify-between gap-3 fine">Held for you <HoldTimer expiresAt={appt.holdExpiresAt} onExpire={() => setExpired(true)} /></p>}
          <button type="button" className="link mt-4 inline-flex min-h-11 cursor-pointer items-center text-sm" onClick={() => pickAgain(null)}>Choose another time</button>
          <p className="fine mt-1">For someone else, or another doctor? <Link to={`/book?service=${appt.service.groupSlug}`} className="link">Use the full booking</Link>.</p>
        </aside>

        <form ref={form} noValidate onSubmit={submit} onChange={(e) => { const n = (e.target as unknown as HTMLInputElement).name; setErrors(({ [n]: _, ...r }) => r) }} className="grid min-w-0 gap-6 lg:order-1">
          {expired && (
            <Notice tone="warn"><span role="alert">Your time was released. We hold a time for 10 minutes and that time has passed. Nothing has been charged.{' '}
              <button type="button" className="link min-h-11" onClick={() => pickAgain('Your last time was released. Choose a time again.')}>Choose a time again</button></span></Notice>
          )}

          {!user && (
            <section className="card grid gap-5" aria-labelledby="details-h">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <h2 id="details-h" className="font-sans text-[20px] font-medium">{mode === 'signup' ? 'Your details' : 'Sign in'}</h2>
                <button type="button" className="link min-h-11 text-sm" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setErrors({}); setError(null) }}>
                  {mode === 'signup' ? 'I already have an account' : 'I’m new to Carevia'}
                </button>
              </div>
              {mode === 'signup' ? (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="First name" name="firstName" autoComplete="given-name" required error={errors.firstName} />
                    <Field label="Last name" name="lastName" autoComplete="family-name" required error={errors.lastName} />
                  </div>
                  <Field label="Email" name="email" type="email" autoComplete="email" required error={errors.email} hint="We’ll send your booking confirmation here." />
                  <Field label="Mobile number" name="phone" type="tel" autoComplete="tel" required error={errors.phone} hint="Portuguese numbers can skip +351. We confirm it before your visit." />
                  <Field label="Date of birth" name="dateOfBirth" type="date" autoComplete="bday" max={lisbonDay()} required error={errors.dateOfBirth} hint="Accounts are for adults." />
                  <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required error={errors.password} hint="At least 8 characters." />
                  <p className="fine">By creating an account you agree to Carevia’s terms and privacy notice.</p>
                </>
              ) : (
                <>
                  <Field label="Email" name="email" type="email" autoComplete="email" required error={errors.email} />
                  <Field label="Password" name="password" type="password" autoComplete="current-password" required error={errors.password} />
                  <p className="fine"><Link to="/forgot-password" className="link">Forgot your password?</Link></p>
                </>
              )}
            </section>
          )}

          <section className="card grid gap-4" aria-labelledby="terms-h">
            <h2 id="terms-h" className="font-sans text-[20px] font-medium">{consent.data?.title ?? 'How your visit works'}</h2>
            {consent.error ? <ErrorState error={consent.error} onRetry={consent.reload} /> : !consent.data ? <Loading lines={2} /> : (
              <div className="max-h-[260px] overflow-auto rounded-[12px] bg-mist/40 p-4" tabIndex={0} role="region" aria-label="Consultation terms">
                <Markdown source={consent.data.body} headingLevel={3} />
                <p className="fine mt-4">Version {consent.data.version}</p>
              </div>
            )}
            <div>
              <label className="check">
                <input type="checkbox" name="mainland" checked={mainland} onChange={(e) => setMainland(e.target.checked)} aria-describedby="mainland-hint mainland-err" />
                <span>I’ll be in mainland Portugal during the visit.<span id="mainland-hint" className="fine block">Our doctors can’t see patients in Madeira, the Azores or abroad yet.</span></span>
              </label>
              <p id="mainland-err" className="field-error" aria-live="polite">{errors.mainland}</p>
            </div>
            <div>
              <label className="check">
                <input type="checkbox" name="agreed" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-describedby="agreed-err" />
                <span>I’ve read these terms. I agree to a video consultation on them.</span>
              </label>
              <p id="agreed-err" className="field-error" aria-live="polite">{errors.agreed}</p>
            </div>
          </section>

          <div>
            <FormError error={error} />
            {clash && <button type="button" className="btn btn-secondary mt-3" onClick={() => pickAgain(null)}>Choose another time</button>}
            <button className="btn btn-primary btn-block mt-3" disabled={pending || expired || !consent.data}>
              {pending ? 'Confirming…' : `Pay ${euro(appt.fee)} (demo)`}
            </button>
            <p className="fine mt-2 text-center">Demo payment: no card is needed and no money is taken. Your visit is confirmed once paid.</p>
          </div>
        </form>
      </div>
    </div>
  )
}

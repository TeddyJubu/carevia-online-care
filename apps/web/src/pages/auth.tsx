import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { useLoad } from '../lib/load'
import { DEMO_BUILD, useDemo } from '../lib/demo'
import { ADMIN_HOME, homeFor, useSession } from '../lib/session'
import { age, lisbonDay } from '../lib/time'
import type { User } from '../lib/types'
import { Field, FormError, Notice, PageTitle } from '../ui/kit'

type Errors = Record<string, string>
const val = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

/** Accepts "912 345 678", "+351 912345678" or another country's +number; returns E.164 or null. */
export function toE164(raw: string): string | null {
  const s = raw.replace(/[\s().-]/g, '')
  if (/^9\d{8}$/.test(s) || /^2\d{8}$/.test(s)) return `+351${s}` // a Portuguese number without the country code
  if (/^00\d{8,15}$/.test(s)) return `+${s.slice(2)}`
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null
}

/** One submit/pending/error flow for every auth form. */
function useSubmit() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(fn: () => Promise<void>) {
    setPending(true)
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.') } finally { setPending(false) }
  }
  return { pending, error, setError, run }
}

export function SignInForm({ onDone, submitLabel = 'Sign in' }: { onDone: (u: User) => void; submitLabel?: string }) {
  const { refresh } = useSession()
  const { pending, error, run } = useSubmit()
  const [twoFactor, setTwoFactor] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const demo = useDemo()

  const finish = async () => {
    const u = await refresh()
    if (u) onDone(u)
  }
  const signIn = (email: string, password: string) => run(async () => {
    const r = await api.auth.signIn(email, password)
    if (r.twoFactorRedirect) return setTwoFactor(true)
    await finish()
  })

  if (twoFactor) {
    return (
      <form noValidate className="grid gap-5" onSubmit={(e) => {
        e.preventDefault()
        const code = val(new FormData(e.currentTarget), 'code')
        run(async () => { await api.auth.verifyTotp(code); await finish() })
      }}>
        <p className="muted">Enter the 6-digit code from your authenticator app.</p>
        <Field label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus />
        <FormError error={error} />
        <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Checking…' : 'Continue'}</button>
      </form>
    )
  }

  return (
    <div className="grid gap-6">
      {DEMO_BUILD && demo && (
        <section aria-labelledby="demo-logins" className="card card-mist">
          <h2 id="demo-logins" className="text-[20px]">Demo accounts</h2>
          <p className="fine mt-1">Fictional people. One click signs you in.</p>
          <div className="mt-4 grid gap-2">
            {demo.accounts.filter((a) => a.role !== 'admin').map((a) => (
              <button key={a.email} type="button" className="btn btn-secondary btn-block flex-wrap justify-between gap-y-0 py-2 text-left" disabled={pending} onClick={() => signIn(a.email, a.password)}>
                <span>{a.label}</span><span className="fine">{a.email}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <form noValidate className="grid gap-5" onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const email = val(f, 'email'), password = String(f.get('password') ?? '')
        const errs = { email: email ? undefined : 'Enter your email address.', password: password ? undefined : 'Enter your password.' }
        setErrors(errs)
        if (errs.email || errs.password) return (e.currentTarget.elements.namedItem(errs.email ? 'email' : 'password') as HTMLElement).focus()
        signIn(email, password)
      }}>
        <Field label="Email" name="email" type="email" autoComplete="email" required error={errors.email} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required error={errors.password} />
        <FormError error={error} />
        <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Signing in…' : submitLabel}</button>
        <Link to="/forgot-password" className="link justify-self-start text-sm inline-flex min-h-11 items-center">Forgot your password?</Link>
      </form>
    </div>
  )
}

/** Sign-up fields from a form, with the phone in E.164 and an error per bad field. Shared with the booking checkout. */
export function validateSignUp(f: FormData) {
  const b = { firstName: val(f, 'firstName'), lastName: val(f, 'lastName'), email: val(f, 'email'), phone: val(f, 'phone'), dateOfBirth: val(f, 'dateOfBirth'), password: String(f.get('password') ?? '') }
  const errs: Errors = {}
  if (!b.firstName) errs.firstName = 'Enter your first name.'
  if (!b.lastName) errs.lastName = 'Enter your last name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) errs.email = 'Enter an email address, like name@example.com.'
  const phone = toE164(b.phone)
  if (!phone) errs.phone = 'Enter a mobile number, like 912 345 678 or +44 7700 900123.'
  if (!b.dateOfBirth) errs.dateOfBirth = 'Enter your date of birth.'
  else if (age(b.dateOfBirth) < 18) errs.dateOfBirth = 'You need to be 18 or over to create an account. A parent or guardian can book for a child.'
  if (b.password.length < 8) errs.password = 'Use at least 8 characters.'
  return { body: { ...b, phone: phone ?? b.phone }, errs }
}

export function SignUpForm({ onDone, submitLabel = 'Create account' }: { onDone: (u: User) => void; submitLabel?: string }) {
  const { refresh } = useSession()
  const { pending, error, setError, run } = useSubmit()
  const [errors, setErrors] = useState<Errors>({})

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { body: b, errs } = validateSignUp(new FormData(e.currentTarget))
    setErrors(errs)
    setError(null)
    if (Object.keys(errs).length) {
      e.currentTarget.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus()
      return
    }
    run(async () => {
      try {
        await api.auth.signUp(b)
      } catch (err) {
        // Field-level codes go next to their field; everything else shows above the button.
        if (err instanceof ApiError && err.code === 'PASSWORD_COMPROMISED') return setErrors({ password: err.message })
        if (err instanceof ApiError && err.code === 'UNDERAGE') return setErrors({ dateOfBirth: err.message })
        if (err instanceof ApiError && err.code.startsWith('USER_ALREADY_EXISTS')) return setErrors({ email: err.message })
        throw err
      }
      const u = await refresh()
      if (u) onDone(u)
    })
  }

  return (
    <form noValidate className="grid gap-5" onSubmit={onSubmit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" name="firstName" autoComplete="given-name" required error={errors.firstName} />
        <Field label="Last name" name="lastName" autoComplete="family-name" required error={errors.lastName} />
      </div>
      <Field label="Email" name="email" type="email" autoComplete="email" required error={errors.email} hint="We’ll send your booking confirmation here." />
      <Field label="Mobile number" name="phone" type="tel" autoComplete="tel" required error={errors.phone} hint="Portuguese numbers can skip +351. We confirm it before your visit." />
      <Field label="Date of birth" name="dateOfBirth" type="date" autoComplete="bday" max={lisbonDay()} required error={errors.dateOfBirth} hint="Accounts are for adults. You’ll add a child after this." />
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required error={errors.password} hint="At least 8 characters." />
      <FormError error={error} />
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Creating your account…' : submitLabel}</button>
      <p className="fine">By creating an account you agree to Carevia’s terms and privacy notice.</p>
    </form>
  )
}

function AuthShell({ title, lede, children, footer }: { title: string; lede?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="page-narrow">
      <PageTitle lede={lede}>{title}</PageTitle>
      <div className="card mt-8 p-6 sm:p-8">{children}</div>
      {footer && <p className="mt-6 text-center text-[15px] muted">{footer}</p>}
    </div>
  )
}

function useNext() {
  const [params] = useSearchParams()
  const next = params.get('next')
  // Only same-app paths, never another site.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

// next= is honoured only when it is a page for the role that signed in: doctor pages for doctors, the rest for
// patients. /doctors (the public list) is not a doctor page.
const doctorPage = (path: string) => /^\/doctor(\/|\?|$)/.test(path)

export function SignIn() {
  const navigate = useNavigate()
  const next = useNext()
  const [params] = useSearchParams()
  const { user, signOut } = useSession()
  // Admins have their own app: a signed-in admin goes straight there.
  if (user?.role === 'admin') { window.location.replace(ADMIN_HOME); return null }
  if (params.get('admin')) {
    return (
      <AuthShell title="Admin accounts use the admin app" lede="This portal is for patients and doctors. Sign out, then sign in to the admin app.">
        <button className="btn btn-secondary" onClick={() => signOut()}>Sign out</button>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Sign in" lede="See your visits, get ready for the next one, and manage your family." footer={<>New to Carevia? <Link className="link" to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></>}>
      <SignInForm onDone={(u) => u.role === 'admin' ? window.location.replace(ADMIN_HOME) : navigate(next && (u.role === 'clinician') === doctorPage(next) ? next : homeFor(u), { replace: true })} />
    </AuthShell>
  )
}

export function SignUp() {
  const navigate = useNavigate()
  const next = useNext()
  return (
    <AuthShell title="Create your account" lede="It takes a minute. You can add your children once you’re in." footer={<>Already have an account? <Link className="link" to={`/signin${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link></>}>
      {/* Sign-up always makes a patient, so a doctor-only next would only show "This page is for doctors". */}
      <SignUpForm onDone={() => navigate(next && !doctorPage(next) ? next : '/account', { replace: true })} />
    </AuthShell>
  )
}

export function ForgotPassword() {
  const { pending, error, run } = useSubmit()
  const [sent, setSent] = useState<string | null>(null)
  return (
    <AuthShell title="Reset your password" lede="We’ll email you a link to choose a new one." footer={<Link className="link" to="/signin">Back to sign in</Link>}>
      {sent ? (
        <div role="status">
          <Notice tone="ok">If there’s an account for <strong className="font-medium">{sent}</strong>, a reset link is on its way. It works once.</Notice>
          {DEMO_BUILD && <p className="fine mt-4">Demo: emails are not sent. Open the <Link to="/dev/outbox" className="link">outbox</Link> to find the link.</p>}
        </div>
      ) : (
        <form noValidate className="grid gap-5" onSubmit={(e) => {
          e.preventDefault()
          const email = val(new FormData(e.currentTarget), 'email')
          run(async () => { await api.auth.requestReset(email); setSent(email) })
        }}>
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <FormError error={error} />
          <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthShell>
  )
}

function AcceptInvite({ token }: { token: string }) {
  const navigate = useNavigate()
  const { refresh } = useSession()
  const email = useLoad(() => api.auth.previewInvite(token).then((r) => r.email), [token])
  const { pending, error, run } = useSubmit()
  const [fieldError, setFieldError] = useState<Errors>({})
  if (email.error) {
    return (
      <AuthShell title="This invite can’t be used" lede={email.error.message}>
        <p className="fine">Link expired, or already used? Ask the Carevia team to send a new invite.</p>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Set your password" lede="This password signs you in to your agenda. Your patients never see it. Carevia never asks for your iMED password.">
      <form noValidate className="grid gap-5" onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const pw = String(f.get('password') ?? ''), again = String(f.get('again') ?? '')
        const errs: Errors = {}
        if (pw.length < 8) errs.password = 'Use at least 8 characters.'
        else if (pw !== again) errs.again = 'The two passwords don’t match.'
        setFieldError(errs)
        if (Object.keys(errs).length) return
        run(async () => {
          try { await api.auth.acceptInvite(token, pw) } catch (err) {
            if (err instanceof ApiError && (err.code === 'PASSWORD_COMPROMISED' || err.code === 'PASSWORD_CHECK_UNAVAILABLE')) {
              return setFieldError({ password: err.message })
            }
            throw err
          }
          await api.auth.signIn(email.data || '', pw)
          await refresh()
          navigate('/doctor', { replace: true })
        })
      }}>
        <Field label="Email" name="email" type="email" value={email.data ?? ''} readOnly onChange={() => {}} hint="From the invite. It can’t be changed here." />
        <Field label="New password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters." error={fieldError.password} />
        <Field label="Type it again" name="again" type="password" autoComplete="new-password" error={fieldError.again} />
        <p className="fine">Setting a password starts your setup. It takes about ten minutes.</p>
        <FormError error={error} />
        <button className="btn btn-primary btn-block" disabled={pending || !email.data}>{pending ? 'Saving…' : 'Save password and continue'}</button>
      </form>
    </AuthShell>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const invite = params.get('invite') ?? ''
  if (invite) return <AcceptInvite token={invite} />
  const token = params.get('token') ?? ''
  const { pending, error, run } = useSubmit()
  const [fieldError, setFieldError] = useState<Errors>({})
  const [done, setDone] = useState(false)
  if (!token) {
    return <AuthShell title="This link is incomplete" lede="Open the link from your email again, or ask for a new one."><Link to="/forgot-password" className="btn btn-primary">Ask for a new link</Link></AuthShell>
  }
  return (
    <AuthShell title="Choose a new password">
      {done ? (
        <div role="status" className="grid gap-5">
          <Notice tone="ok">Your password has been changed.</Notice>
          <Link to="/signin" className="btn btn-primary">Sign in</Link>
        </div>
      ) : (
        <form noValidate className="grid gap-5" onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const pw = String(f.get('password') ?? ''), again = String(f.get('again') ?? '')
          const errs: Errors = {}
          if (pw.length < 8) errs.password = 'Use at least 8 characters.'
          else if (pw !== again) errs.again = 'The two passwords don’t match.'
          setFieldError(errs)
          if (Object.keys(errs).length) return
          run(async () => {
            try { await api.auth.resetPassword(token, pw) } catch (err) {
              if (err instanceof ApiError && err.code === 'PASSWORD_COMPROMISED') return setFieldError({ password: err.message })
              throw err
            }
            setDone(true)
          })
        }}>
          <Field label="New password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters." error={fieldError.password} />
          <Field label="Type it again" name="again" type="password" autoComplete="new-password" error={fieldError.again} />
          <FormError error={error} />
          <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Saving…' : 'Save new password'}</button>
        </form>
      )}
    </AuthShell>
  )
}

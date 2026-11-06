import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { content } from '../lib/content'
import { useLoad, useNow } from '../lib/load'
import { useSession } from '../lib/session'
import { age, birthDate, fullDate, lisbonDay, shortDate, when } from '../lib/time'
import type { Appointment, FamilyMember } from '../lib/types'
import { Dialog, Empty, ErrorState, euro, Field, FormError, Loading, Markdown, Notice, PageTitle, paymentStatus, Still } from '../ui/kit'
import { toE164 } from './auth'

type Errors = Record<string, string>
const val = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')

const NAV = [
  { to: '/account', label: 'Home', end: true },
  { to: '/account/family', label: 'Family' },
  { to: '/account/payments', label: 'Payments' },
  { to: '/account/profile', label: 'Profile' },
  { to: '/account/security', label: 'Security' },
]

// Wireframe 12: a left menu on desktop, a compact scrollable row on phones. No "Documents": those live in iMED.
export function AccountLayout() {
  return (
    <div className="page">
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Your account" className="side-nav min-w-0">
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:sticky lg:top-[calc(var(--header-h)+24px)]">
            {NAV.map((n) => (
              <li key={n.to} className="flex-none">
                <NavLink to={n.to} end={n.end} className="whitespace-nowrap">{n.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

const OUTCOME: Record<string, [string, string]> = {
  completed: ['Completed', 'badge-ok'],
  needs_in_person: ['In-person care advised', 'badge-warn'],
  no_show: ['Missed', 'badge-danger'],
  ended_poor_quality: ['Call ended early', 'badge-warn'],
}

function pastBadge(a: Appointment): [string, string] {
  if (a.status === 'cancelled') return ['Cancelled', '']
  if (a.outcome) return OUTCOME[a.outcome]
  if (a.status === 'completed') return OUTCOME.completed
  return ['Visit ended', '']
}

function UpcomingCard({ a, now }: { a: Appointment; now: number }) {
  const open = Date.parse(a.call.joinOpensAt) <= now && now < Date.parse(a.call.joinClosesAt)
  return (
    <article className="card">
      <p className="eyebrow">Upcoming</p>
      <h3 className="mt-2 text-[20px]">{when(a.startsAt)}</h3>
      <p className="muted mt-1">
        {a.service.name} · {a.doctor.name}
        {a.patient?.kind === 'family' && <> · for {a.patient.displayName}</>}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {open ? (
          <Link to={a.preJoin?.confirmedAt ? `/visits/${a.id}/waiting` : `/visits/${a.id}/join`} className="btn btn-primary btn-sm">Join your visit</Link>
        ) : (
          <>
            <Link to={`/visits/${a.id}`} className="btn btn-secondary btn-sm">Prepare</Link>
            <span className="fine">Join opens 10 minutes before</span>
          </>
        )}
      </div>
    </article>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = `sec-${title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <section aria-labelledby={id} className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id={id}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function AccountHome() {
  const { user } = useSession()
  const [params, setParams] = useSearchParams()
  const now = useNow(30000)
  const upcoming = useLoad(() => api.appointments('upcoming'), [])
  const past = useLoad(() => api.appointments('past'), [])
  const family = useLoad(() => api.family(), [])
  const verified = params.get('verified') === '1'

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle title="Your account">Hello, {user?.firstName}</PageTitle>
        <Link to="/services-v2" className="btn btn-primary">Book new care</Link>
      </div>

      {verified && (
        <Notice tone="ok" className="mt-6 items-center justify-between">
          <span role="status">Your email is confirmed.</span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => { params.delete('verified'); setParams(params, { replace: true }) }}>Dismiss</button>
        </Notice>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 content-start">
          <h2 className="sr-only">Upcoming visits</h2>
          {upcoming.loading && !upcoming.data ? <Loading label="Loading your visits" lines={2} />
            : upcoming.error ? <ErrorState error={upcoming.error} onRetry={upcoming.reload} title="We couldn’t load your visits" />
            : upcoming.data!.appointments.length === 0 ? (
              <Empty title="No upcoming visits" image={<Still name="empty-no-visits" className="aspect-[3/2]" />} action={<Link to="/services-v2" className="btn btn-primary btn-sm">Book new care</Link>}>
                When you book a visit, it appears here with everything you need to get ready.
              </Empty>
            ) : upcoming.data!.appointments.map((a) => <UpcomingCard key={a.id} a={a} now={now} />)}
        </div>

        <section aria-labelledby="family-title" className="card self-start">
          <p className="eyebrow" id="family-title">Family</p>
          {family.loading && !family.data ? <div className="mt-4"><Loading label="Loading your family" lines={2} /></div>
            : family.error ? <div className="mt-4"><ErrorState error={family.error} onRetry={family.reload} /></div>
            : (
              <ul className="rows mt-3">
                <li className="flex justify-between gap-4 py-3"><span>You</span><span className="muted">Account holder</span></li>
                {family.data!.members.map((m) => (
                  <li key={m.id} className="flex justify-between gap-4 py-3">
                    <span>{m.firstName} {m.lastName}</span>
                    <span className="muted">{m.relationship === 'child' ? 'Child' : 'Adult you care for'}</span>
                  </li>
                ))}
              </ul>
            )}
          <Link to="/account/family" className="link mt-2 inline-flex min-h-11 items-center">Manage family</Link>
        </section>
      </div>

      <Section title="Past visits">
        {past.loading && !past.data ? <Loading label="Loading past visits" lines={2} />
          : past.error ? <ErrorState error={past.error} onRetry={past.reload} title="We couldn’t load your past visits" />
          : past.data!.appointments.length === 0 ? <Empty title="No past visits yet" art="caught-up">Visits you’ve had will be listed here.</Empty>
          : (
            <ul className="card rows p-0">
              {past.data!.appointments.map((a) => {
                const [label, tone] = pastBadge(a)
                return (
                  <li key={a.id} className="grid gap-x-6 gap-y-1 px-5 py-4 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center">
                    <span className="fine sm:text-[15px] sm:text-[var(--color-ink)]">{fullDate(a.startsAt)}</span>
                    <span className="min-w-0">
                      <span className="block font-medium">{a.service.name}{a.patient?.kind === 'family' && <span className="muted font-normal"> · {a.patient.displayName}</span>}</span>
                      <span className="fine">{a.doctor.name}</span>
                    </span>
                    <span className="mt-2 flex items-center gap-4 sm:mt-0">
                      <span className={`badge ${tone}`}>{label}</span>
                      {a.status !== 'cancelled' && <Link to={`/visits/${a.id}/done`} className="link inline-flex min-h-11 items-center text-[15px]">Visit status<span className="sr-only">, {fullDate(a.startsAt)}</span></Link>}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
      </Section>
    </>
  )
}

// ---------- Family ----------

type MemberInput = Omit<FamilyMember, 'id'>

function checkMember(b: Partial<MemberInput>): Errors {
  const e: Errors = {}
  if (!b.firstName) e.firstName = 'Enter their first name.'
  if (!b.lastName) e.lastName = 'Enter their last name.'
  if (!b.dateOfBirth) e.dateOfBirth = 'Enter their date of birth.'
  else if (b.dateOfBirth > lisbonDay()) e.dateOfBirth = 'The date of birth can’t be in the future.'
  else if (b.relationship === 'child' && age(b.dateOfBirth) >= 18) e.dateOfBirth = 'A child must be under 18. Add them as an adult you care for instead.'
  else if (b.relationship === 'adult' && age(b.dateOfBirth) < 18) e.dateOfBirth = 'An adult must be 18 or over. Add them as your child instead.'
  if (!b.relationship) e.relationship = 'Choose who they are to you.'
  return e
}

function MemberForm({ initial, submitLabel, onSave, onCancel }: { initial?: FamilyMember; submitLabel: string; onSave: (m: MemberInput) => Promise<void>; onCancel?: () => void }) {
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const b = { firstName: val(f, 'firstName'), lastName: val(f, 'lastName'), dateOfBirth: val(f, 'dateOfBirth'), relationship: val(f, 'relationship') as MemberInput['relationship'] }
    const errs = checkMember(b)
    setErrors(errs)
    setError(null)
    if (Object.keys(errs).length) {
      form.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus()
      return
    }
    setPending(true)
    try {
      await onSave(b)
      if (!initial) { form.reset(); setErrors({}) }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5">
      <fieldset className="grid gap-3">
        <legend className="field-label mb-2">Who are they to you?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="choice">
            <input type="radio" name="relationship" value="child" defaultChecked={initial ? initial.relationship === 'child' : true} aria-describedby={errors.relationship ? 'rel-err' : undefined} />
            <span><span className="block font-medium">My child</span><span className="fine">Under 18. You book as parent or guardian.</span></span>
          </label>
          <label className="choice">
            <input type="radio" name="relationship" value="adult" defaultChecked={initial?.relationship === 'adult'} />
            <span><span className="block font-medium">Another adult I care for</span><span className="fine">18 or over.</span></span>
          </label>
        </div>
        <p id="rel-err" className="field-error" aria-live="polite">{errors.relationship}</p>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" name="firstName" autoComplete="off" defaultValue={initial?.firstName} error={errors.firstName} />
        <Field label="Last name" name="lastName" autoComplete="off" defaultValue={initial?.lastName} error={errors.lastName} />
      </div>
      <Field label="Date of birth" name="dateOfBirth" type="date" max={lisbonDay()} defaultValue={initial?.dateOfBirth} error={errors.dateOfBirth} />
      <FormError error={error} />
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

export function FamilyPage() {
  const family = useLoad(() => api.family(), [])
  const [editing, setEditing] = useState<FamilyMember | null>(null)
  const [removing, setRemoving] = useState<FamilyMember | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removePending, setRemovePending] = useState(false)
  const [status, setStatus] = useState('')

  async function remove() {
    if (!removing) return
    setRemovePending(true)
    setRemoveError(null)
    try {
      await api.removeFamily(removing.id)
      setStatus(`${removing.firstName} was removed.`)
      setRemoving(null)
      family.reload()
    } catch (e) {
      setRemoveError(errMsg(e))
    } finally {
      setRemovePending(false)
    }
  }

  return (
    <>
      <PageTitle title="Family" lede="Book visits for your children, or for an adult you care for, from your own account.">Family</PageTitle>
      <p role="status" aria-live="polite" className="sr-only">{status}</p>

      <section aria-labelledby="members-title" className="mt-8">
        <h2 id="members-title" className="sr-only">Family members</h2>
        {family.loading && !family.data ? <Loading label="Loading your family" lines={2} />
          : family.error ? <ErrorState error={family.error} onRetry={family.reload} title="We couldn’t load your family" />
          : family.data!.members.length === 0 ? <Empty title="No family members yet" image={<Still name="empty-no-family" className="aspect-[3/2]" />}>Add a child or an adult you care for, and you can book visits for them.</Empty>
          : (
            <ul className="card rows p-0">
              {family.data!.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{m.firstName} {m.lastName}</span>
                    <span className="fine">{m.relationship === 'child' ? 'Child' : 'Adult you care for'} · Born {birthDate(m.dateOfBirth)}</span>
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(m)}>Edit<span className="sr-only"> {m.firstName}</span></button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setRemoveError(null); setRemoving(m) }}>Remove<span className="sr-only"> {m.firstName}</span></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section aria-labelledby="add-title" className="card mt-8 p-6 sm:p-8">
        <h2 id="add-title">Add a family member</h2>
        <p className="muted mt-2 mb-6">Their visits stay under your account. Children never get their own login.</p>
        <MemberForm submitLabel="Add family member" onSave={async (m) => { await api.addFamily(m); setStatus(`${m.firstName} was added.`); family.reload() }} />
      </section>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.firstName}` : 'Edit'}>
        {editing && (
          <MemberForm key={editing.id} initial={editing} submitLabel="Save changes" onCancel={() => setEditing(null)}
            onSave={async (m) => { await api.updateFamily(editing.id, m); setStatus('Changes saved.'); setEditing(null); family.reload() }} />
        )}
      </Dialog>

      <Dialog open={!!removing} onClose={() => setRemoving(null)} title={removing ? `Remove ${removing.firstName}?` : 'Remove'}>
        <p className="muted">You won’t be able to book for them until you add them again. Past visits stay in your account.</p>
        <div className="mt-4"><FormError error={removeError} /></div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn btn-danger" disabled={removePending} onClick={remove}>{removePending ? 'Removing…' : 'Remove'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => setRemoving(null)}>Keep</button>
        </div>
      </Dialog>
    </>
  )
}

// ---------- Profile ----------

export function ProfilePage() {
  const { user, refresh, signOut } = useSession()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  if (!user) return <Loading />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const firstName = val(f, 'firstName'), lastName = val(f, 'lastName')
    const phone = toE164(val(f, 'phone'))
    const errs: Errors = {}
    if (!firstName) errs.firstName = 'Enter your first name.'
    if (!lastName) errs.lastName = 'Enter your last name.'
    if (!phone) errs.phone = 'Enter a mobile number, like 912 345 678 or +44 7700 900123.'
    setErrors(errs)
    setError(null)
    setSaved(false)
    if (Object.keys(errs).length) {
      form.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus()
      return
    }
    setPending(true)
    try {
      await api.updateMe({ firstName, lastName, phone: phone! })
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageTitle title="Profile" lede="Your doctor sees your name. We use your mobile to confirm it’s you before each visit.">Profile</PageTitle>
      <form noValidate onSubmit={onSubmit} className="card mt-8 grid gap-5 p-6 sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" name="firstName" autoComplete="given-name" defaultValue={user.firstName} error={errors.firstName} />
          <Field label="Last name" name="lastName" autoComplete="family-name" defaultValue={user.lastName} error={errors.lastName} />
        </div>
        <Field label="Mobile number" name="phone" type="tel" autoComplete="tel" defaultValue={user.phone} error={errors.phone} hint="Portuguese numbers can skip +351." />
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="field-label">Email</dt><dd className="mt-1 break-words">{user.email}</dd></div>
          <div><dt className="field-label">Date of birth</dt><dd className="mt-1">{birthDate(user.dateOfBirth)}</dd></div>
        </dl>
        <p className="fine -mt-2">To change your email, contact support. Date of birth can’t be changed online.</p>
        <FormError error={error} />
        <div role="status" aria-live="polite">{saved && <Notice tone="ok">Your profile is saved.</Notice>}</div>
        <div><button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button></div>
      </form>
      <button type="button" className="btn btn-secondary mt-8" onClick={async () => { await signOut(); navigate('/signin') }}>Sign out</button>
    </>
  )
}

// ---------- Security ----------

function ChangePassword() {
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const current = String(f.get('current') ?? ''), next = String(f.get('next') ?? ''), again = String(f.get('again') ?? '')
    const errs: Errors = {}
    if (!current) errs.current = 'Enter your current password.'
    if (next.length < 8) errs.next = 'Use at least 8 characters.'
    else if (next !== again) errs.again = 'The two passwords don’t match.'
    setErrors(errs)
    setError(null)
    setDone(false)
    if (Object.keys(errs).length) {
      form.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus()
      return
    }
    setPending(true)
    try {
      await api.auth.changePassword(current, next)
      form.reset()
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_PASSWORD') setErrors({ current: err.message })
      else if (err instanceof ApiError && (err.code === 'PASSWORD_COMPROMISED' || err.code === 'PASSWORD_TOO_SHORT')) setErrors({ next: err.message })
      else setError(errMsg(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-labelledby="pw-title" className="card mt-8 p-6 sm:p-8">
      <h2 id="pw-title">Password</h2>
      <p className="muted mt-2 mb-6">Changing it signs you out on your other devices.</p>
      <form noValidate onSubmit={onSubmit} className="grid gap-5">
        <Field label="Current password" name="current" type="password" autoComplete="current-password" error={errors.current} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="New password" name="next" type="password" autoComplete="new-password" hint="At least 8 characters." error={errors.next} />
          <Field label="Type it again" name="again" type="password" autoComplete="new-password" error={errors.again} />
        </div>
        <FormError error={error} />
        <div role="status" aria-live="polite">{done && <Notice tone="ok">Your password has been changed.</Notice>}</div>
        <div><button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Change password'}</button></div>
      </form>
    </section>
  )
}

/** The base32 secret from an otpauth:// URI, in groups of four for typing into an app. */
function setupKey(totpURI: string): string {
  const secret = new URL(totpURI.replace(/^otpauth:/, 'https:')).searchParams.get('secret') ?? ''
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret
}

function TwoFactor() {
  const { user, refresh } = useSession()
  const [step, setStep] = useState<'idle' | 'password' | 'verify' | 'disable'>('idle')
  const [setup, setSetup] = useState<{ key: string; codes: string[] } | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const on = !!user?.twoFactorEnabled

  const reset = () => { setStep('idle'); setSetup(null); setFieldError(null); setError(null); setCopied(false) }

  async function submit(e: FormEvent<HTMLFormElement>, fn: (value: string) => Promise<void>, fieldCodes: string[]) {
    e.preventDefault()
    const v = String(new FormData(e.currentTarget).get('v') ?? '').trim()
    setFieldError(null)
    setError(null)
    if (!v) return setFieldError(step === 'verify' ? 'Enter the 6-digit code.' : 'Enter your password.')
    setPending(true)
    try {
      await fn(v)
    } catch (err) {
      if (err instanceof ApiError && fieldCodes.includes(err.code)) setFieldError(err.message)
      else setError(errMsg(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-labelledby="tf-title" className="card mt-8 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tf-title">Two-factor sign-in</h2>
        <span className={`badge ${on ? 'badge-ok' : ''}`}>{on ? 'On' : 'Off'}</span>
      </div>
      <p className="muted mt-2">After your password, we also ask for a code from an authenticator app on your phone.</p>
      <div role="status" aria-live="polite" className="mt-4 empty:mt-0">{notice && <Notice tone="ok">{notice}</Notice>}</div>

      {step === 'idle' && (
        <button type="button" className={`btn ${on ? 'btn-secondary' : 'btn-primary'} mt-6`} onClick={() => { setNotice(null); setStep(on ? 'disable' : 'password') }}>
          {on ? 'Turn off two-factor' : 'Turn on two-factor'}
        </button>
      )}

      {(step === 'password' || step === 'disable') && (
        <form noValidate className="mt-6 grid gap-5" onSubmit={(e) => submit(e, async (pw) => {
          if (step === 'disable') {
            await api.auth.disableTwoFactor(pw)
            await refresh()
            reset()
            setNotice('Two-factor sign-in is off.')
          } else {
            const r = await api.auth.enableTwoFactor(pw)
            setSetup({ key: setupKey(r.totpURI), codes: r.backupCodes })
            setStep('verify')
          }
        }, ['INVALID_PASSWORD'])}>
          <Field label="Your password" name="v" type="password" autoComplete="current-password" autoFocus error={fieldError}
            hint={step === 'disable' ? 'To turn two-factor off, confirm it’s you.' : 'To turn two-factor on, confirm it’s you.'} />
          <FormError error={error} />
          <div className="flex flex-wrap gap-3">
            <button className={`btn ${step === 'disable' ? 'btn-danger' : 'btn-primary'}`} disabled={pending}>{pending ? 'Checking…' : step === 'disable' ? 'Turn off' : 'Continue'}</button>
            <button type="button" className="btn btn-secondary" onClick={reset}>Cancel</button>
          </div>
        </form>
      )}

      {step === 'verify' && setup && (
        <div className="mt-6 grid gap-6">
          <ol className="grid gap-5 pl-5 list-decimal marker:text-[var(--color-muted)]">
            <li>
              <p>In your authenticator app, add an account and enter this setup key:</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <code className="rounded-[10px] bg-[var(--color-mist)] px-4 py-3 font-mono text-[17px] tracking-wider break-all">{setup.key}</code>
                <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
                  try { await navigator.clipboard.writeText(setup.key.replace(/\s/g, '')); setCopied(true) } catch { setCopied(false) }
                }}>{copied ? 'Copied' : 'Copy key'}</button>
              </div>
              <p className="sr-only" role="status" aria-live="polite">{copied ? 'Setup key copied.' : ''}</p>
            </li>
            <li>
              <p>Keep these backup codes somewhere safe. Each one signs you in once if you lose your phone.</p>
              <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-[15px] sm:grid-cols-4">
                {setup.codes.map((c) => <li key={c} className="rounded-lg bg-[var(--color-mist)] px-3 py-2 text-center">{c}</li>)}
              </ul>
            </li>
            <li>
              <p>Enter the 6-digit code your app shows now.</p>
              <form noValidate className="mt-3 grid gap-5" onSubmit={(e) => submit(e, async (code) => {
                await api.auth.verifyTotp(code)
                await refresh()
                reset()
                setNotice('Two-factor sign-in is on. You’ll need a code each time you sign in.')
              }, ['INVALID_TWO_FACTOR_CODE', 'INVALID_CODE'])}>
                <Field label="Code" name="v" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" error={fieldError} className="max-w-[220px]" />
                <FormError error={error} />
                <div className="flex flex-wrap gap-3">
                  <button className="btn btn-primary" disabled={pending}>{pending ? 'Checking…' : 'Turn on'}</button>
                  <button type="button" className="btn btn-secondary" onClick={reset}>Cancel</button>
                </div>
              </form>
            </li>
          </ol>
        </div>
      )}
    </section>
  )
}

export function SecurityPage() {
  return (
    <>
      <PageTitle title="Security" lede="Keep your account, and your family’s visits, safe.">Security</PageTitle>
      <ChangePassword />
      <TwoFactor />
    </>
  )
}

// ---------- Payments and refunds: every paid visit, and the refund terms from content/patient-journey/cancellation.md ----------
export function PaymentsPage() {
  const upcoming = useLoad(() => api.appointments('upcoming'), [])
  const past = useLoad(() => api.appointments('past'), [])
  const error = upcoming.error ?? past.error
  const loading = !upcoming.data || !past.data
  // ponytail: built from the two appointment lists (only paid visits have a payment); a /api/payments list can
  // replace this if a patient ever has hundreds of visits.
  const paid = [...(upcoming.data?.appointments ?? []), ...(past.data?.appointments ?? [])]
    .filter((a) => a.payment)
    .sort((x, y) => y.payment!.paidAt.localeCompare(x.payment!.paidAt))
  return (
    <>
      <PageTitle title="Payments & refunds" lede="Every visit you’ve paid for. In this demo no money is taken, so there is nothing to refund.">Payments &amp; refunds</PageTitle>
      <section aria-labelledby="payments-title" className="mt-8">
        <h2 id="payments-title" className="sr-only">Your payments</h2>
        {error ? <ErrorState error={error} onRetry={() => { upcoming.reload(); past.reload() }} title="We couldn’t load your payments" />
          : loading ? <Loading label="Loading your payments" lines={3} />
          : paid.length === 0 ? <Empty title="No payments yet" art="caught-up" action={<Link to="/services-v2" className="btn btn-primary btn-sm">Book new care</Link>}>When you pay for a visit, it appears here with its receipt.</Empty>
          : (
            <ul className="card card-tight rows">
              {paid.map((a) => {
                const s = paymentStatus(a)
                return (
                  <li key={a.id} className="grid items-center gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="min-w-0">
                      <Link to={`/visits/${a.id}`} className="link inline-flex min-h-11 items-center font-medium">Visit on {fullDate(a.startsAt)}</Link>
                      <p className="fine">{a.service.groupName} · {a.doctor.name}{a.patient?.kind === 'family' ? ` · for ${a.patient.displayName}` : ''}</p>
                      {a.status === 'cancelled' && <p className="fine">Cancelled. No money was taken in this demo.</p>}
                    </div>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium tabular-nums">{euro(a.payment!.amount)}</span>
                      <span className={`badge ${s.tone}`}>{s.label}</span>
                      <span className="fine">Paid {shortDate(a.payment!.paidAt)}</span>
                    </p>
                    <Link to={`/visits/${a.id}/receipt`} className="btn btn-quiet btn-sm justify-self-start">Receipt<span className="sr-only"> for the visit on {fullDate(a.startsAt)}</span></Link>
                  </li>
                )
              })}
            </ul>
          )}
      </section>
      <section aria-labelledby="refund-title" className="mt-10">
        <h2 id="refund-title">{content('cancellation').title}</h2>
        <div className="card mt-4"><Markdown source={content('cancellation').body} /></div>
      </section>
    </>
  )
}

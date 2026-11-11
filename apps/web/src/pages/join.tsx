import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../lib/api'
import { useLoad } from '../lib/load'
import { Field, FormError, Notice, PageTitle } from '../ui/kit'
import { toE164 } from './auth'

type Errors = Record<string, string>
const val = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

// DrOnline-style "Registe-se como médico", reshaped for Portugal: an application, not a self-serve account.
// Carevia checks the cédula with the professional body before a doctor sees patients (apps/api/src/routes/doctor-applications.js).
const BODIES = [
  { id: 'medicos', label: 'Ordem dos Médicos' },
  { id: 'psicologos', label: 'Ordem dos Psicólogos Portugueses' },
  { id: 'nutricionistas', label: 'Ordem dos Nutricionistas' },
]

const WHY = [
  ['Consult from where you work', 'Secure video in the browser, on a computer, tablet or phone. Nothing to install, for you or your patients.'],
  ['Your notes stay in iMED', 'Prescriptions, certificates and the clinical record stay in iMED. Carevia handles booking, payment and the call.'],
  ['You choose your hours', 'Open the slots that suit you. Patients pay before a visit is confirmed, so your time is booked properly.'],
]

const STEPS = [
  ['Apply', 'Tell us about your practice. It takes about five minutes.'],
  ['We verify and call you', 'We check your cédula with your Ordem, then call to talk through your hours and services.'],
  ['Open your agenda', 'We set up your doctor login. Once your hours are in, patients can book you.'],
]

function validate(f: FormData) {
  const b = {
    firstName: val(f, 'firstName'), lastName: val(f, 'lastName'), email: val(f, 'email'), phone: val(f, 'phone'),
    body: val(f, 'body'), cedula: val(f, 'cedula').replace(/\s/g, ''), specialty: val(f, 'specialty'), groupSlug: val(f, 'groupSlug'),
    yearsInPractice: val(f, 'yearsInPractice'), languages: val(f, 'languages'), message: val(f, 'message'), consent: f.get('consent') === 'on',
  }
  const errs: Errors = {}
  if (!b.firstName) errs.firstName = 'Enter your first name.'
  if (!b.lastName) errs.lastName = 'Enter your last name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) errs.email = 'Enter an email address, like name@example.com.'
  const phone = toE164(b.phone)
  if (!phone) errs.phone = 'Enter a mobile number, like 912 345 678.'
  if (!b.body) errs.body = 'Choose your professional body.'
  if (!/^[A-Za-z0-9-]{3,20}$/.test(b.cedula)) errs.cedula = 'Enter your cédula profissional number, as on your card.'
  if (!b.specialty) errs.specialty = 'Enter your specialty, or General practice.'
  const years = Number(b.yearsInPractice)
  if (b.yearsInPractice === '' || !Number.isInteger(years) || years < 0 || years > 60) errs.yearsInPractice = 'Enter a whole number of years, like 8.'
  if (!b.languages) errs.languages = 'Enter the languages you consult in.'
  if (!b.consent) errs.consent = 'Tick this so we can review your application.'
  return { body: { ...b, phone: phone ?? b.phone, yearsInPractice: years }, errs }
}

export function JoinPage() {
  const catalog = useLoad(() => api.services(), [])
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { body, errs } = validate(new FormData(e.currentTarget))
    setErrors(errs)
    setError(null)
    if (Object.keys(errs).length) {
      e.currentTarget.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus()
      return
    }
    setPending(true)
    api.applyAsDoctor(body)
      .then(() => { setSent(body.email); window.scrollTo({ top: 0 }) })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'))
      .finally(() => setPending(false))
  }

  if (sent) {
    return (
      <div className="page-narrow" role="status">
        <PageTitle eyebrow="For doctors" lede="We’ll check your cédula with your Ordem and call you within a few working days.">Application received</PageTitle>
        <Notice tone="ok" className="mt-8"><span>We’ll write to <strong className="font-medium">{sent}</strong> if we need anything else.</span></Notice>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/?site" className="btn btn-secondary">Carevia homepage</a>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-16">
        <div>
          <PageTitle eyebrow="For doctors" title="Join Carevia" lede="See patients across mainland Portugal by video, on hours you choose. No fees to join.">Consult online with Carevia</PageTitle>
          <section className="mt-10 grid gap-6" aria-labelledby="why-h">
            <h2 id="why-h" className="font-sans text-[20px] font-medium">Why doctors join</h2>
            <ul className="grid gap-5">
              {WHY.map(([title, text]) => (
                <li key={title} className="border-t border-[#102d5014] pt-4">
                  <h3 className="font-sans text-[17px] font-medium">{title}</h3>
                  <p className="muted mt-1">{text}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-10 grid gap-6" aria-labelledby="steps-h">
            <h2 id="steps-h" className="font-sans text-[20px] font-medium">Three steps to your first visit</h2>
            <ol className="grid gap-5">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="flex gap-4">
                  <span className="eyebrow w-8 flex-none pt-[3px]">{String(i + 1).padStart(2, '0')}</span>
                  <span><strong className="font-medium">{title}</strong><span className="muted block mt-1">{text}</span></span>
                </li>
              ))}
            </ol>
          </section>
          <p className="mt-10 text-[15px] muted">Already work with Carevia? <Link className="link" to="/signin?next=/doctor">Sign in to your agenda</Link></p>
        </div>

        <section className="card p-6 sm:p-8 self-start" aria-labelledby="form-h">
          <h2 id="form-h" className="font-sans text-[22px] font-medium">Doctor registration</h2>
          <p className="fine mt-1">We review every application before a doctor sees patients.</p>
          <form noValidate className="mt-6 grid gap-5" onSubmit={onSubmit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="First name" name="firstName" autoComplete="given-name" required error={errors.firstName} />
              <Field label="Last name" name="lastName" autoComplete="family-name" required error={errors.lastName} />
            </div>
            <Field label="Email" name="email" type="email" autoComplete="email" required error={errors.email} />
            <Field label="Mobile number" name="phone" type="tel" autoComplete="tel" required error={errors.phone} hint="We call to talk through your application." />
            <Field as="select" label="Professional body" name="body" required error={errors.body} defaultValue="">
              <option value="" disabled>Choose one</option>
              {BODIES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Field>
            <Field label="Cédula profissional" name="cedula" inputMode="numeric" autoComplete="off" required error={errors.cedula} hint="Your registration number with your Ordem." />
            <Field label="Specialty" name="specialty" required error={errors.specialty} hint="For example, General and family medicine, or Clinical psychology." />
            <Field as="select" label="Area of care" name="groupSlug" defaultValue="" hint="Where your consultations would sit on Carevia.">
              <option value="">Not sure yet</option>
              {catalog.data?.groups.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Years in practice" name="yearsInPractice" type="number" inputMode="numeric" min={0} max={60} required error={errors.yearsInPractice} />
              <Field label="Languages" name="languages" required error={errors.languages} placeholder="Portuguese, English" />
            </div>
            <Field as="textarea" label="Anything else (optional)" name="message" rows={4} maxLength={2000} hint="Hours you’d like to offer, or questions for us." />
            <div>
              <label className="check">
                <input type="checkbox" name="consent" aria-describedby="consent-err" aria-invalid={errors.consent ? true : undefined} />
                <span>Carevia may store these details and check my cédula with my Ordem to review this application.</span>
              </label>
              <p id="consent-err" className="field-error" aria-live="polite">{errors.consent}</p>
            </div>
            <FormError error={error} />
            <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Sending…' : 'Send application'}</button>
          </form>
        </section>
      </div>
    </div>
  )
}

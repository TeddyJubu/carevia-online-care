import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { useLoad } from '../lib/load'
import { useSession } from '../lib/session'
import { addDays, age, birthDate, dayLabel, hhmm, lisbonDay, when } from '../lib/time'
import type { Appointment, Doctor, For, GroupSlug, ServiceGroup, Slot } from '../lib/types'
import { CareIcon, Icon } from '../ui/icons'
import { DoctorAvatar, ErrorState, euro, Field, FormError, HoldTimer, Loading, Markdown, Notice, PageTitle } from '../ui/kit'
import { validateSignUp } from './auth'

// Booking, following the patient-booking wireframe's service flow:
// services home (search + areas) > choose who cares for you (service, filters, doctors) > doctor profile >
// the doctor's times > checkout (details if signed out, consent, demo payment). Video, for the account holder.
// The full flow (/book) stays for booking for someone else.

const STEPS = ['Service and doctor', 'Date and time', 'Confirm and pay']
function Steps({ at }: { at: number }) {
  return (
    <ol className="mb-6 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Booking steps">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === at ? 'step' : undefined} className={i === at ? 'font-medium text-ink' : 'muted'}>{i + 1}. {label}</li>
      ))}
    </ol>
  )
}

// Family's "Book for Leo" says who the next booking is for. The times step reads the relationship,
// checkout the person; paying clears it, and it lapses after 30 minutes so a later booking starts fresh.
const BOOK_FOR = 'carevia.bookFor'
type BookFor = { for: Exclude<For, 'self'>; memberId: string; at: number }
export const setBookFor = (v: Omit<BookFor, 'at'>) => sessionStorage.setItem(BOOK_FOR, JSON.stringify({ ...v, at: Date.now() }))
const bookFor = (): Partial<BookFor> => {
  try {
    const v = JSON.parse(sessionStorage.getItem(BOOK_FOR) ?? 'null') as BookFor | null
    return v && Date.now() - v.at < 30 * 60_000 ? v : {}
  } catch { return {} }
}

const useCatalog = () => useLoad(() => api.services(), [])
const serviceOf = (groups: ServiceGroup[], d: Pick<Doctor, 'service' | 'group'>) => {
  const g = groups.find((x) => x.id === d.group) ?? groups.find((x) => x.services.some((s) => s.name === d.service))
  return { group: g, service: g?.services.find((s) => s.name === d.service) }
}

// ---------- 1. services home: a field guide of plates ----------
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']
const pad = (n: number) => String(n).padStart(2, '0')
const lisbon = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', ...o })
const shortNext = lisbon({ weekday: 'short', day: 'numeric', month: 'short' })
const initial = lisbon({ weekday: 'narrow' })
const todayLong = lisbon({ weekday: 'long', day: 'numeric', month: 'long' })
/** "Today 13:40", "Tomorrow 09:00" or "Mon 11 Nov". */
const nextLabel = (iso: string) => { const d = dayLabel(iso); return d === 'Today' || d === 'Tomorrow' ? `${d} ${hhmm(iso)}` : shortNext.format(new Date(iso)) }
/** Rows of 2, 3, 2… as in the design; a short last row stretches to fill. Column spans on a 6-column grid. */
function plateSpans(n: number): number[] {
  const out: number[] = []
  for (let i = 0, r = 0; i < n; r++) {
    const len = Math.min(r % 2 ? 3 : 2, n - i)
    for (let k = 0; k < len; k++, i++) out.push(6 / len)
  }
  return out
}

export function ServicesHome() {
  const { user } = useSession()
  const catalog = useCatalog()
  const [q, setQ] = useState('')
  const all = catalog.data?.groups ?? []
  const term = q.trim().toLowerCase()
  const groups = all.map((g, i) => ({ g, no: i + 1, matches: term ? g.services.filter((s) => s.name.toLowerCase().includes(term)) : [] }))
    .filter(({ g, matches }) => !term || matches.length || `${g.name} ${g.blurb} ${g.fieldMarks.join(' ')}`.toLowerCase().includes(term))
  const spans = plateSpans(groups.length)
  const busiest = Math.max(1, ...all.flatMap((g) => g.week))
  const fees = all.map((g) => g.fromFee).filter((f): f is number => f != null)
  const today = catalog.data?.today
  const days = today ? Array.from({ length: 7 }, (_, i) => new Date(`${addDays(today, i)}T12:00:00Z`)) : []
  const byName = new Map(all.map((g) => [g.name.toLowerCase(), g.slug]))

  return (
    <div className="page">
      <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
        <div className="min-w-0 max-w-[700px]">
          <PageTitle title="Find the right care" eyebrow={<span className="font-sans text-[13px] font-medium uppercase tracking-[0.09em] text-[#1d4f91]">{user ? 'Your patient home' : 'Book a video visit'} · A field guide</span>}>
            {user && <>Welcome back, {user.firstName}.<br /></>}Know which care you need.
          </PageTitle>
          <p className="lede mt-4">
            {all.length ? `${WORDS[all.length] ?? all.length} services that can look alike. ` : ''}Each plate shows the few signs that tell them apart, and when doctors are around this week.
          </p>
          <label className="mt-7 flex h-14 max-w-[600px] items-center gap-2.5 rounded-xl bg-white px-4 shadow-[0_1px_2px_#102d500d,0_10px_28px_#102d5012] outline outline-1 -outline-offset-1 outline-line focus-within:outline-2 focus-within:outline-[var(--focus)]">
            <Icon name="search" size={18} className="text-muted" />
            <span className="sr-only">Search services</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Service, specialty or health concern"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-[16px] outline-none placeholder:text-muted" />
          </label>
        </div>
        <aside aria-labelledby="key-title" className="on-navy w-full shrink-0 rounded-[14px] bg-gradient-to-b from-[#0b2648] to-[#163d6e] p-6 text-white shadow-[0_16px_40px_#0b264833] outline outline-1 -outline-offset-1 outline-white/10 lg:w-[340px]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="key-title" className="text-[20px] text-white">Key to symbols</h2>
            <span className="text-[12px] text-white/70">How to read a plate</span>
          </div>
          <ul className="mt-3.5 grid gap-3 text-[14px]">
            <li className="flex items-center gap-3"><Icon name="stethoscope" size={16} className="text-[#9cc0ee]" />Icon: the type of care on each plate</li>
            <li className="flex items-center gap-3"><Icon name="arrow-right" size={16} className="text-[#9cc0ee]" />Field mark: a sign this is the right service</li>
            <li className="flex items-center gap-3"><Icon name="mouse-pointer-click" size={16} className="text-[#9cc0ee]" />Select any plate to choose a doctor</li>
            <li className="flex items-center gap-3"><Icon name="chart-column" size={16} className="text-[#9cc0ee]" />Open slots over the next 7 days</li>
          </ul>
        </aside>
      </div>

      <div className="mt-16 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-[#102d5033] pb-4">
        <h2 className="text-[30px]">Plates 01–{pad(all.length || 1)}</h2>
        {today && (
          <p className="fine flex items-center gap-2 text-ink">
            <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-accent" />
            Today, {todayLong.format(days[0])}.{fees.length > 0 && ` Every consultation from ${euro(Math.min(...fees))}.`}
          </p>
        )}
      </div>

      {catalog.error ? <div className="mt-6"><ErrorState error={catalog.error} onRetry={catalog.reload} /></div>
        : !catalog.data ? <div className="mt-6"><Loading label="Loading services" /></div>
        : !groups.length ? <p className="mt-6" role="status">No matching services. Try another search.</p> : (
          <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6" aria-label="Areas of care">
            {groups.map(({ g, no, matches }, i) => {
              // The whole plate opens the doctors page with a service already chosen: the searched one, else the first.
              const pick = matches[0] ?? g.services[0]
              const [other, ...why] = g.confusedWith.split(':')
              const otherSlug = why.length ? byName.get(other.trim().toLowerCase()) : undefined
              const free = g.week.reduce((a, b) => a + b, 0)
              return (
                <li key={g.slug} id={`plate-${g.slug}`} style={{ '--span': spans[i] } as CSSProperties}
                  className="group relative flex scroll-mt-24 flex-col gap-[18px] rounded-[14px] bg-white p-6 shadow-[0_1px_2px_#102d500d,0_10px_28px_#102d5012] transition-shadow duration-300 hover:shadow-[0_1px_2px_#102d500d,0_16px_36px_#102d5024] outline outline-1 -outline-offset-1 outline-[#102d5012] sm:p-7 lg:col-span-(--span)">
                  <div className="flex items-center gap-4">
                    <CareIcon name={g.icon} />
                    <span className="flex items-center gap-2.5 text-[12px] font-semibold tracking-[0.12em] text-[#1d4f91]">PLATE {pad(no)}<span aria-hidden="true" className="h-px w-6 bg-[#1d4f9140]" /></span>
                  </div>
                  <div>
                    <h3 className="font-serif text-[30px] font-normal leading-[35px]">
                      {/* ponytail: stretched link, its ::after covers the plate so the whole card is one link without nesting <a>s */}
                      <Link to={`/book/doctors?group=${g.slug}${pick ? `&service=${pick.id}` : ''}`}
                        className="no-underline outline-none after:absolute after:inset-0 after:rounded-[14px] after:content-[''] focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[#367cbb]">
                        {g.name}
                      </Link>
                    </h3>
                    <p className="mt-1 text-[15px] text-[#56677a]">{g.blurb}</p>
                  </div>
                  {g.fieldMarks.length > 0 && (
                    <div>
                      <p className="text-[12px] font-semibold tracking-[0.1em] text-[#56677a]">FIELD MARKS</p>
                      <ul className="mt-2.5 grid gap-2.5 text-[15px] font-medium">
                        {g.fieldMarks.map((m) => <li key={m} className="flex gap-2.5"><Icon name="arrow-right" size={16} className="mt-[3px] text-[#1d4f91]" />{m}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="mt-auto flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[13px] text-[#56677a]">Next 7 days</p>
                      <ol className="mt-1.5 flex gap-1" aria-label={`${free} open ${free === 1 ? 'slot' : 'slots'} over the next 7 days`}>
                        {days.map((d, k) => (
                          <li key={k} aria-hidden="true" className="flex w-2.5 flex-col items-center gap-1">
                            <span className="flex h-[30px] items-end">
                              <span className={`w-2 rounded-[2px] ${g.week[k] ? (k === 0 ? 'bg-accent' : 'bg-ink') : 'bg-[#9cc0ee]'}`}
                                style={{ height: g.week[k] ? 6 + Math.round((24 * g.week[k]) / busiest) : 3 }} />
                            </span>
                            <span className={`text-[11px] leading-none ${k === 0 ? 'font-semibold text-accent' : 'text-[#56677a]'}`}>{initial.format(d)}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-medium text-ok">{g.nextAvailableAt ? `Next: ${nextLabel(g.nextAvailableAt)}` : 'No open times this week'}</p>
                      {g.fromFee != null && <p className="text-[18px] font-semibold">From {euro(g.fromFee)}</p>}
                    </div>
                  </div>
                  {g.confusedWith && (
                    <p className="border-t border-[#102d5012] pt-3.5 text-[14px] italic text-[#56677a]">
                      Often confused with {otherSlug ? <><a href={`#plate-${otherSlug}`} className="relative z-10 text-ink underline underline-offset-2">{other.trim()}</a>:{why.join(':')}</> : g.confusedWith}
                    </p>
                  )}
                  <span aria-hidden="true" className="mt-1 grid size-11 place-items-center self-end rounded-full bg-gradient-to-b from-[#0b2648] to-[#163d6e] text-white transition-transform duration-300 ease-(--ease) group-hover:scale-110">
                    <Icon name="mouse-pointer-click" size={20} />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      <p className="fine mt-10">
        You can book for yourself, your child or an adult you care for. You choose who when you pick a time.
        {all[0] && <> Still unsure? Start with <a href={`#plate-${all[0].slug}`} className="underline underline-offset-2">Plate 01</a>, a GP can redirect you.</>}
      </p>
    </div>
  )
}

// ---------- 2. choose who cares for you ----------
const LANGUAGES = ['English', 'French', 'German', 'Portuguese', 'Spanish', 'Italian']
const AVAILABILITY: [string, string][] = [['', 'Any date'], ['0', 'Today'], ['3', 'Within 3 days'], ['7', 'Within a week']]
const PRICES: [string, string][] = [['', 'Any price'], ['60', 'Up to €60'], ['80', 'Up to €80'], ['100', 'Up to €100'], ['150', 'Up to €150']]

export function ServicesDoctors() {
  const catalog = useCatalog()
  const [params, setParams] = useSearchParams()
  const groups = catalog.data?.groups ?? []
  const group = groups.find((g) => g.slug === params.get('group')) ?? groups[0]
  const service = group?.services.find((s) => String(s.id) === params.get('service')) ?? group?.services[0]
  const f = { language: params.get('language') ?? '', specialty: params.get('specialty') ?? '', available: params.get('available') ?? '', maxFee: params.get('maxFee') ?? '' }
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    setParams(next, { replace: true })
  }

  const doctors = useLoad(
    () => (group && service ? api.doctors({ groupSlug: group.slug as GroupSlug, service: service.name, language: f.language || undefined, sort: 'first-available' }).then((r) => r.doctors) : Promise.resolve([])),
    [group?.slug, service?.name, f.language],
  )
  const specialties = [...new Set((doctors.data ?? []).map((d) => d.specialty))]
  const shown = (doctors.data ?? []).filter((d) =>
    (!f.specialty || d.specialty === f.specialty) &&
    (!f.maxFee || d.fee <= Number(f.maxFee)) &&
    (!f.available || (!!d.nextAvailableAt && lisbonDay(d.nextAvailableAt) <= addDays(lisbonDay(), Number(f.available)))))
  const [more, setMore] = useState(!!(f.specialty || f.available))
  const filtered = Object.values(f).some(Boolean)
  const clear = () => set({ language: '', specialty: '', available: '', maxFee: '' })

  if (catalog.error) return <div className="page"><ErrorState error={catalog.error} onRetry={catalog.reload} /></div>
  if (!group || !service) return <div className="page"><Loading /></div>
  return (
    <div className="page">
      <Steps at={0} />
      <PageTitle eyebrow="Find your care" title={`${service.name} doctors`}>Choose who cares for you</PageTitle>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Field as="select" label="Area of care" value={group.slug} onChange={(e) => set({ group: e.target.value, service: '', specialty: '' })}>
          {groups.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
        </Field>
        <Field as="select" label="Service" className="field-attn" value={service.id} onChange={(e) => set({ service: e.target.value, specialty: '' })}>
          {group.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Field>
      </div>
      {/* These services are named after documents; booking one must not read as a promise of it (PLAN.md). */}
      {(group.slug === 'certificates' || group.slug === 'renewals') && (
        <Notice className="mt-4"><span>Your doctor decides, after assessing you, whether anything needs to be issued. Booking a visit doesn’t guarantee a certificate, a test request or a renewal. Anything issued comes through iMED.</span></Notice>
      )}
      {/* One compact row so the first doctors show without scrolling; the rarer filters fold under More filters.
          Buttons: 48px high with a 6px bottom margin (the .field gap under the input) so they line up with the selects. */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field as="select" label="Language" className="min-w-[150px] flex-1 sm:flex-none" value={f.language} onChange={(e) => set({ language: e.target.value })}>
          <option value="">Any language</option>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}
        </Field>
        <Field as="select" label="Price" className="min-w-[150px] flex-1 sm:flex-none" value={f.maxFee} onChange={(e) => set({ maxFee: e.target.value })}>
          {PRICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Field>
        <button type="button" className="chip mb-1.5 min-h-12" aria-expanded={more} aria-controls="more-filters" onClick={() => setMore(!more)}>
          {more ? 'Fewer filters' : `More filters${f.specialty || f.available ? ' (on)' : ''}`}
        </button>
        {filtered && <button type="button" className="link mb-1.5 min-h-12 text-sm" onClick={clear}>Clear filters</button>}
      </div>
      {more && (
        <div id="more-filters" className="mt-1 flex flex-wrap gap-3 animate-[pop_0.45s_cubic-bezier(.22,1,.36,1)]">
          <Field as="select" label="Specialty" className="min-w-[180px] flex-1 sm:flex-none" value={f.specialty} onChange={(e) => set({ specialty: e.target.value })}>
            <option value="">Any specialty</option>{specialties.map((s) => <option key={s}>{s}</option>)}
          </Field>
          <Field as="select" label="Availability" className="min-w-[180px] flex-1 sm:flex-none" value={f.available} onChange={(e) => set({ available: e.target.value })}>
            {AVAILABILITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Field>
        </div>
      )}

      <p className="muted mt-4" role="status">{doctors.loading && !doctors.data ? 'Loading doctors' : `${shown.length} ${shown.length === 1 ? 'doctor' : 'doctors'} for ${service.name}, earliest first`}</p>
      <div className="mt-4 grid gap-4" aria-busy={doctors.loading}>
        {doctors.error ? <ErrorState error={doctors.error} onRetry={doctors.reload} />
          : !doctors.data ? <Loading label="Loading doctors" />
          : !shown.length ? (
            <div className="card text-center">
              <h2 className="text-[22px]">No doctors match these filters</h2>
              <p className="muted mt-2">Try any language or any price.</p>
              <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={clear}>Clear filters</button>
            </div>
          ) : shown.map((d) => <DoctorCard key={d.id} doctor={d} />)}
      </div>
    </div>
  )
}

/** A doctor with their next three times: tapping a time opens their times with it already chosen. */
function DoctorCard({ doctor: d }: { doctor: Doctor }) {
  const next = useLoad(() => (d.nextAvailableAt ? api.slots(d.id, lisbonDay(d.nextAvailableAt), 7).then((r) => r.slots.slice(0, 3)) : Promise.resolve([])), [d.id])
  const times = `/book/doctors/${d.id}/times`
  return (
    <article className="card card-tight" aria-labelledby={`doc-${d.id}`}>
      <div className="flex gap-4">
        <DoctorAvatar doctor={d} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 id={`doc-${d.id}`} className="font-sans text-[18px] font-medium tracking-[-0.01em]">{d.name}</h2>
            <span className="text-[18px] font-medium">{euro(d.fee)}</span>
          </div>
          <p className="fine">{d.specialty} · {d.languages}{d.experience && ` · ${d.experience}`}</p>
          {d.approach && <p className="muted mt-2 line-clamp-2 max-w-[60ch] text-[15px]">{d.approach}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2" aria-busy={next.loading}>
        {!d.nextAvailableAt ? <p className="fine">No times in the next three weeks.</p>
          : !next.data ? <div className="skeleton h-11 w-64" aria-hidden="true" />
          : (
            <>
              <span className="fine mr-1">{dayLabel(next.data[0]?.startsAt ?? d.nextAvailableAt)}</span>
              {next.data.map((s) => (
                <Link key={String(s.id)} to={`${times}?slot=${s.id}`} className="chip no-underline">
                  {lisbonDay(s.startsAt) === lisbonDay(next.data![0].startsAt) ? hhmm(s.startsAt) : when(s.startsAt)}
                  <span className="sr-only"> with {d.name}</span>
                </Link>
              ))}
              <Link to={times} className="link ml-1 inline-flex min-h-11 items-center text-sm">More times<span className="sr-only"> with {d.name}</span></Link>
            </>
          )}
        <Link to={`/book/doctors/${d.id}`} className="link ml-auto inline-flex min-h-11 items-center text-sm">Profile<span className="sr-only"> of {d.name}</span></Link>
      </div>
    </article>
  )
}

// ---------- 3. doctor profile ----------
export function ServicesDoctor() {
  const { id } = useParams()
  const catalog = useCatalog()
  const doctor = useLoad(() => api.doctor(Number(id)).then((r) => r.doctor), [id])
  if (doctor.error) return <div className="page"><ErrorState error={doctor.error} onRetry={doctor.reload} /></div>
  const d = doctor.data
  if (!d) return <div className="page"><Loading /></div>
  const { group, service } = serviceOf(catalog.data?.groups ?? [], d)
  return (
    <div className="page">
      <Link to={group ? `/book/doctors?group=${group.slug}&service=${service?.id ?? ''}` : '/book'} className="link inline-flex min-h-11 items-center text-sm">Back to doctors</Link>
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card">
          <div className="flex items-center gap-4">
            <DoctorAvatar doctor={d} size={64} />
            <div className="min-w-0">
              <PageTitle title={d.name}>{d.name}</PageTitle>
              <p className="mt-1">{d.specialty} · Video consultations</p>
            </div>
          </div>
          <hr className="rule my-6" />
          <dl className="summary">
            {d.approach && <><dt>About your doctor</dt><dd>{d.approach}</dd></>}
            <dt>Languages</dt><dd>{d.languages}</dd>
            {d.experience && <><dt>Experience</dt><dd>{d.experience}</dd></>}
            {d.education && <><dt>Training <span className="badge ml-1">Illustrative</span></dt><dd>{d.education}</dd></>}
            <dt>Services</dt><dd>{d.service}{d.groupName && ` · ${d.groupName}`}</dd>
            <dt>Professional registration</dt><dd>Ordem dos Médicos cédula {d.cedula}</dd>
          </dl>
        </section>
        <aside className="card" aria-label={`Book with ${d.name}`}>
          <h2 className="text-[24px]">Book with {d.name}</h2>
          <p className="mt-2">{d.service}</p>
          <p className="mt-4 text-[22px] font-medium">{euro(d.fee)}</p>
          <p className="fine">Per video consultation</p>
          <Link to={`/book/doctors/${d.id}/times`} className="btn btn-primary btn-block mt-6">Choose a time</Link>
        </aside>
      </div>
    </div>
  )
}

// ---------- 4. the doctor's times ----------
const DAYS = 3
const WHO: [For, string, string][] = [['self', 'Me', 'Aged 18 or over'], ['child', 'My child', 'You book as parent or guardian'], ['adult', 'Another adult', 'Someone you care for']]
const FOR_LABEL: Record<For, string> = { self: 'Me', child: 'Your child', adult: 'An adult you care for' }

export function ServicesTimes() {
  const { id } = useParams()
  const { user } = useSession()
  const navigate = useNavigate()
  const { state } = useLocation()
  const catalog = useCatalog()
  const doctor = useLoad(() => api.doctor(Number(id)).then((r) => r.doctor), [id])
  const slots = useLoad(() => api.slots(Number(id), lisbonDay(), 21).then((r) => r.slots), [id])
  const [picked, setPicked] = useState<Slot | null>(null)
  const [allDays, setAllDays] = useState(false)
  const [error, setError] = useState<string | null>((state as { notice?: string } | null)?.notice ?? null)
  const [pending, setPending] = useState(false)
  // Who the visit is for is part of the hold (the API fixes it then), so it's asked here; checkout names the person.
  const [who, setWho] = useState<For>(() => (state as { for?: For } | null)?.for ?? bookFor().for ?? 'self')
  const days = useMemo(() => {
    const m = new Map<string, Slot[]>()
    for (const s of slots.data ?? []) m.set(dayLabel(s.startsAt), [...(m.get(dayLabel(s.startsAt)) ?? []), s])
    return [...m]
  }, [slots.data])
  // Arrived from a time on a doctor card: that time is already chosen (if still free).
  const [params] = useSearchParams()
  useEffect(() => {
    const want = params.get('slot')
    const s = want && slots.data?.find((x) => String(x.id) === want)
    if (!s) return
    setPicked(s)
    if (days.findIndex(([, list]) => list.includes(s)) >= DAYS) setAllDays(true)
  }, [slots.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const d = doctor.data
  const { service } = d ? serviceOf(catalog.data?.groups ?? [], d) : { service: undefined }
  const staff = !!user && user.role !== 'patient'

  // Continue waits (disabled, a fraction of a second) until the catalog has said which service this doctor offers.
  const waiting = !service && !catalog.error
  async function go() {
    if (!picked) return setError('Choose a time to continue.')
    // The service comes from the catalog, which can still be loading; never let Continue do nothing.
    if (!service) return setError(catalog.error ? 'We couldn’t load this service. Refresh the page and try again.' : 'Still loading this visit’s details. Try again in a moment.')
    setPending(true)
    setError(null)
    try {
      const { appointment } = await api.hold({ slotId: picked.id, serviceId: service.id, for: who })
      navigate('/book/checkout', { state: { appt: appointment } })
    } catch (e) {
      const x = e as ApiError
      setError(x.code === 'SLOT_TAKEN' ? 'Someone has just booked that time. Choose another time.' : x.message)
      if (x.code === 'SLOT_TAKEN') { setPicked(null); slots.reload() }
    } finally {
      setPending(false)
    }
  }

  if (doctor.error) return <div className="page"><ErrorState error={doctor.error} onRetry={doctor.reload} /></div>
  if (!d) return <div className="page"><Loading /></div>
  return (
    <div className="page">
      <Steps at={1} />
      <PageTitle eyebrow={`${d.name} · ${d.service}`} lede="Times are in Lisbon time. We hold your time for 10 minutes while you finish.">Choose your appointment</PageTitle>
      {staff && <Notice tone="warn" className="mt-6"><span>Doctor and admin accounts can’t book visits. Sign out, then book as a patient.</span></Notice>}
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 gap-6">
          <section className="card">
            <div className="flex items-center gap-4">
              <DoctorAvatar doctor={d} />
              <div className="min-w-0"><h2 className="font-sans text-[18px] font-medium">{d.name}</h2><p className="fine">{d.languages} · Video consultation</p></div>
            </div>
            <p className="mt-4">{d.specialty} · {euro(d.fee)} · <Link to={`/book/doctors/${d.id}`} className="link">View profile</Link></p>
            <fieldset className="mt-6 min-w-0">
              <legend className="font-medium">Who is this visit for?</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {WHO.map(([v, label, hint]) => (
                  <label key={v} className="choice">
                    <input type="radio" name="who" checked={who === v} onChange={() => setWho(v)} />
                    <span><span className="block font-medium">{label}</span><span className="fine block">{hint}</span></span>
                  </label>
                ))}
              </div>
              {who !== 'self' && <p className="fine mt-2" aria-live="polite">You book in your own name. At checkout you choose them from your family, or add them.</p>}
            </fieldset>
          </section>
          <section className="card" aria-labelledby="times-h" aria-busy={slots.loading}>
            <h2 id="times-h" className="font-sans text-[20px] font-medium">Available times</h2>
            {slots.error ? <div className="mt-4"><ErrorState error={slots.error} onRetry={slots.reload} /></div>
              : !slots.data ? <div className="mt-4"><Loading lines={2} label="Loading times" /></div>
              : !days.length ? <p className="muted mt-4">No free times in the next three weeks. <Link to="/book" className="link">Choose another doctor</Link>.</p> : (
                <>
                  {(allDays ? days : days.slice(0, DAYS)).map(([label, list]) => (
                    <div key={label} className="mt-5">
                      <h3 className="mb-2 text-[16px]">{label}</h3>
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${label}, times`}>
                        {list.map((s) => (
                          <button key={String(s.id)} type="button" role="radio" aria-checked={picked?.id === s.id} className="chip" disabled={staff}
                            onClick={() => { setPicked(s); setError(null) }}>{hhmm(s.startsAt)}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {days.length > DAYS && <button type="button" className="btn btn-secondary btn-sm mt-6" onClick={() => setAllDays(!allDays)}>{allDays ? 'Fewer days' : 'More days'}</button>}
                </>
              )}
          </section>
        </div>
        <aside className="card max-lg:hidden lg:sticky lg:top-[calc(var(--header-h)+16px)]" aria-label="Your visit">
          <h2 className="font-sans text-[18px] font-medium">{d.service}</h2>
          <p className="mt-2">{d.name}<br />Video consultation · For {FOR_LABEL[who].toLowerCase().replace(/^me$/, 'you')}</p>
          <p className="mt-3 font-medium">{picked ? when(picked.startsAt) : 'Choose an available time'}</p>
          <p className="mt-3 font-medium">Fee {euro(d.fee)}</p>
          <FormError error={error} />
          <button type="button" className="btn btn-primary btn-block mt-4" disabled={pending || staff || waiting} onClick={go}>{pending ? 'Holding your time…' : 'Continue'}</button>
        </aside>
      </div>
      {/* Phones and tablets: the choice and Continue stay in reach while scrolling the times. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-[#102d5014] bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
        <FormError error={error} />
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 leading-tight" aria-live="polite">
            <span className="block font-medium">{picked ? when(picked.startsAt) : 'Choose a time'}</span>
            <span className="fine">{d.name} · {euro(d.fee)}</span>
          </p>
          <button type="button" className="btn btn-primary shrink-0" disabled={pending || staff || waiting} onClick={go}>{pending ? 'Holding…' : 'Continue'}</button>
        </div>
      </div>
    </div>
  )
}

// ---------- 5. checkout ----------
export function ServicesCheckout() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const appt = (state as { appt?: Appointment } | null)?.appt
  if (!appt) {
    return (
      <div className="page">
        <PageTitle lede="If you’ve just paid, your visit is in your account.">No booking in progress</PageTitle>
        <div className="mt-8 flex flex-wrap gap-3"><Link to="/book" className="btn btn-primary">Choose care</Link><Link to="/account" className="btn btn-secondary">Your visits</Link></div>
      </div>
    )
  }
  /** Back to this doctor's times, giving the held time back so others can book it. */
  const pickAgain = (notice: string | null) => {
    void api.release(appt.id).catch(() => {}) // already expired or released: nothing to do
    navigate(`/book/doctors/${appt.doctor.id}/times`, { replace: true, state: { notice, for: appt.for } })
  }
  return <div className="page"><Steps at={2} /><Checkout appt={appt} pickAgain={pickAgain} /></div>
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
  // For a child or another adult: pick them from Family, or add them (signed-out patients always add).
  const kind: For = appt.for ?? 'self'
  const family = useLoad(() => (user && kind !== 'self' ? api.family().then((r) => r.members.filter((m) => m.relationship === kind)) : Promise.resolve([])), [user?.id, kind])
  const [member, setMember] = useState(() => bookFor().memberId ?? '')
  const members = family.data ?? []
  const chosen = member === 'new' || members.some((m) => m.id === member) ? member : members[0]?.id || 'new'
  const child = kind === 'child'
  const picked = user ? members.find((m) => m.id === chosen) : undefined

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
    const addNew = kind !== 'self' && (!user || chosen === 'new')
    const newMember = { firstName: String(f.get('memberFirstName') ?? '').trim(), lastName: String(f.get('memberLastName') ?? '').trim(), dateOfBirth: String(f.get('memberDateOfBirth') ?? ''), relationship: kind as 'child' | 'adult' }
    if (addNew) {
      if (!newMember.firstName) errs.memberFirstName = 'Enter their first name.'
      if (!newMember.lastName) errs.memberLastName = 'Enter their last name.'
      if (!newMember.dateOfBirth) errs.memberDateOfBirth = 'Enter their date of birth.'
      else if (child && age(newMember.dateOfBirth) >= 18) errs.memberDateOfBirth = 'A child must be under 18. Choose another time and pick “Another adult”.'
      else if (!child && age(newMember.dateOfBirth) < 18) errs.memberDateOfBirth = 'This person is under 18. Choose another time and pick “My child”.'
    }
    if (!mainland) errs.mainland = kind === 'self' ? 'Confirm you’ll be in mainland Portugal during the visit.' : 'Confirm you’ll both be in mainland Portugal during the visit.'
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
      if (!a.patient) {
        const memberId = kind === 'self' ? null : addNew ? (await api.addFamily(newMember)).member.id : chosen
        a = (await api.setPatient(a.id, memberId)).appointment
      }
      if (!a.consent) a = (await api.acceptConsent(a.id, consent.data!.version)).appointment
      const { appointment } = await api.pay(a.id)
      sessionStorage.removeItem(BOOK_FOR)
      navigate(`/visits/${appointment.id}?booked=1`, { replace: true }) // Back skips the paid checkout
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
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <aside className="card lg:sticky lg:top-[calc(var(--header-h)+16px)] lg:order-2" aria-label="Your visit">
          <dl className="summary">
            <dt>Care</dt><dd><span className="font-medium">{appt.service.groupName}</span><br />{appt.service.name}</dd>
            <dt>Doctor and time</dt><dd><span className="font-medium">{when(appt.startsAt)}</span><br />{appt.doctor.name}</dd>
            <dt>Consultation</dt><dd>Video, in your browser</dd>
            <dt>For</dt><dd>{picked ? `${picked.firstName} ${picked.lastName}` : FOR_LABEL[kind]}</dd>
            <dt>Recording</dt><dd>Off. Visits are not recorded.</dd>
          </dl>
          <hr className="rule" />
          <p className="mt-3 flex items-baseline justify-between"><span>Total</span><span className="text-[22px] font-medium">{euro(appt.fee)}</span></p>
          {appt.holdExpiresAt && <p className="mt-3 flex items-center justify-between gap-3 fine">Held for you <HoldTimer expiresAt={appt.holdExpiresAt} onExpire={() => setExpired(true)} /></p>}
          <button type="button" className="link mt-4 inline-flex min-h-11 cursor-pointer items-center text-sm" onClick={() => pickAgain(null)}>Choose another time</button>
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

          {kind !== 'self' && (
            <section className="card grid gap-4" aria-labelledby="who-h">
              <h2 id="who-h" className="font-sans text-[20px] font-medium">{child ? 'Which child is this for?' : 'Who is this visit for?'}</h2>
              <p className="fine -mt-2">{child ? 'You book as their parent or guardian, and you join the visit with them.' : 'They should be with you, or able to join, at the visit.'}</p>
              {user && family.error && <ErrorState error={family.error} onRetry={family.reload} />}
              {user && !family.data && !family.error && <Loading lines={1} />}
              {user && members.length > 0 && (
                <fieldset className="grid min-w-0 gap-2">
                  <legend className="sr-only">{child ? 'Your children' : 'People you care for'}</legend>
                  {members.map((m) => (
                    <label key={m.id} className="choice">
                      <input type="radio" name="member" checked={chosen === m.id} onChange={() => setMember(m.id)} />
                      <span><span className="block font-medium">{m.firstName} {m.lastName}</span><span className="fine block">Born {birthDate(m.dateOfBirth)}</span></span>
                    </label>
                  ))}
                  <label className="choice">
                    <input type="radio" name="member" checked={chosen === 'new'} onChange={() => setMember('new')} />
                    <span className="font-medium">Someone else</span>
                  </label>
                </fieldset>
              )}
              {(!user || (family.data && chosen === 'new')) && (
                <div className="grid gap-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Their first name" name="memberFirstName" autoComplete="off" error={errors.memberFirstName} />
                    <Field label="Their last name" name="memberLastName" autoComplete="off" error={errors.memberLastName} />
                  </div>
                  <Field label="Their date of birth" name="memberDateOfBirth" type="date" max={lisbonDay()} error={errors.memberDateOfBirth} />
                  <p className="fine">We only ask what the doctor needs to know who they’re seeing. They’re saved under Family in your account.</p>
                </div>
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
                <span>{kind === 'self' ? 'I’ll be in mainland Portugal during the visit.' : 'We’ll both be in mainland Portugal during the visit.'}<span id="mainland-hint" className="fine block">Our doctors can’t see patients in Madeira, the Azores or abroad yet.</span></span>
              </label>
              <p id="mainland-err" className="field-error" aria-live="polite">{errors.mainland}</p>
            </div>
            <div>
              <label className="check">
                <input type="checkbox" name="agreed" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-describedby="agreed-err" />
                <span>{kind === 'self' ? 'I’ve read these terms. I agree to a video consultation on them.' : 'I’ve read these terms. I agree to a video consultation on them, on their behalf.'}</span>
              </label>
              <p id="agreed-err" className="field-error" aria-live="polite">{errors.agreed}</p>
            </div>
          </section>

          <div>
            <FormError error={error} />
            {clash && <button type="button" className="btn btn-secondary mt-3" onClick={() => pickAgain(null)}>Choose another time</button>}
            <p className="fine mt-3">Demo payment: no card is needed and no money is taken. Your visit is confirmed once paid.</p>
          </div>
          {/* Pinned on phones and tablets: the total, the hold and Pay stay in reach through the form. */}
          <div className="max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:border-t max-lg:border-[#102d5014] max-lg:bg-paper/95 max-lg:px-4 max-lg:py-3 max-lg:backdrop-blur">
            <div className="flex items-center justify-between gap-3 lg:block">
              <p className="min-w-0 leading-tight lg:hidden">
                <span className="block font-medium">{euro(appt.fee)} · {when(appt.startsAt)}</span>
                {appt.holdExpiresAt && !expired && <span className="fine">Held for you <HoldTimer expiresAt={appt.holdExpiresAt} onExpire={() => setExpired(true)} /></span>}
              </p>
              <button className="btn btn-primary shrink-0 lg:w-full" disabled={pending || expired || !consent.data}>
                {pending ? 'Confirming…' : `Pay ${euro(appt.fee)} (demo)`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

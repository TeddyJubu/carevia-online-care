import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../lib/api'
import { useLoad } from '../lib/load'
import { when } from '../lib/time'
import type { Doctor } from '../lib/types'
import { DoctorAvatar, ErrorState, euro, Field, Loading, PageTitle } from '../ui/kit'

// Public list of every doctor: fetched once, filtered here. Filters live in the URL (?q, group, specialty,
// language, n) so links and Back keep them. Book opens that doctor's times (the service is the doctor's own).
const PAGE = 24
const LANG_JOINER = ' · '
const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b))

export function DoctorsPage() {
  // A to Z by surname, like a directory. The API order groups the generated demo names together.
  const surname = (name: string) => name.split(' ').at(-1) ?? name
  const all = useLoad(() => api.doctors({}).then((r) => [...r.doctors].sort((a, b) => surname(a.name).localeCompare(surname(b.name)) || a.name.localeCompare(b.name))), [])
  const [params, setParams] = useSearchParams()
  const f = { q: params.get('q') ?? '', group: params.get('group') ?? '', specialty: params.get('specialty') ?? '', language: params.get('language') ?? '' }
  const limit = Math.max(PAGE, Number(params.get('n')) || PAGE)
  // Any filter change resets "Show more"; typing replaces history so Back isn't a keystroke undo.
  // Functional update: two changes before a re-render (clear, then pick) don't overwrite each other.
  const set = (patch: Record<string, string>, replace = false) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    if (!('n' in patch)) next.delete('n')
    return next
  }, { replace, preventScrollReset: true })

  const list = all.data ?? []
  const groups = useMemo(() => [...new Map(list.map((d) => [d.groupSlug ?? '', d.groupName ?? ''])).entries()].filter(([s]) => s), [list])
  const specialties = useMemo(() => uniq(list.filter((d) => !f.group || d.groupSlug === f.group).map((d) => d.specialty)), [list, f.group])
  const languages = useMemo(() => uniq(list.flatMap((d) => d.languages.split(LANG_JOINER))), [list])
  const term = f.q.trim().toLowerCase()
  const shown = list.filter((d) =>
    (!term || d.name.toLowerCase().includes(term)) &&
    (!f.group || d.groupSlug === f.group) &&
    (!f.specialty || d.specialty === f.specialty) &&
    (!f.language || d.languages.split(LANG_JOINER).includes(f.language)))
  const filtered = Object.values(f).some(Boolean)
  const clear = () => set({ q: '', group: '', specialty: '', language: '' })

  return (
    <div className="page">
      <PageTitle eyebrow="Our doctors" lede="Every doctor on Carevia sees patients by video. Search by name or narrow by area, specialty and language.">
        Find a doctor
      </PageTitle>
      <div role="search" className="mt-8 grid grid-cols-2 gap-x-3 sm:gap-x-4 lg:grid-cols-4" aria-label="Find a doctor">
        <Field label="Search by name" className="col-span-2 lg:col-span-1" type="search" value={f.q} onChange={(e) => set({ q: e.target.value }, true)} placeholder="For example, Laurent" autoComplete="off" />
        <Field as="select" label="Area of care" className="col-span-2 lg:col-span-1" value={f.group} onChange={(e) => set({ group: e.target.value, specialty: '' })}>
          <option value="">All areas</option>{groups.map(([s, n]) => <option key={s} value={s}>{n}</option>)}
        </Field>
        <Field as="select" label="Specialty" className="min-w-0" value={f.specialty} onChange={(e) => set({ specialty: e.target.value })}>
          <option value="">All specialties</option>{specialties.map((s) => <option key={s}>{s}</option>)}
        </Field>
        <Field as="select" label="Language" className="min-w-0" value={f.language} onChange={(e) => set({ language: e.target.value })}>
          <option value="">Any language</option>{languages.map((l) => <option key={l}>{l}</option>)}
        </Field>
      </div>

      <div className="mt-2 flex min-h-11 flex-wrap items-center gap-x-4">
        <p className="muted" role="status">{!all.data ? (all.error ? '' : 'Loading doctors') : `Showing ${shown.length} ${shown.length === 1 ? 'doctor' : 'doctors'}`}</p>
        {filtered && <button type="button" className="link min-h-11 text-sm" onClick={clear}>Clear filters</button>}
      </div>

      <div className="mt-4" aria-busy={all.loading}>
        {all.error ? <ErrorState error={all.error} onRetry={all.reload} />
          : !all.data ? <Loading label="Loading doctors" />
          : !shown.length ? (
            <div className="card text-center">
              <h2 className="text-[22px]">No doctors match</h2>
              <p className="muted mt-2">Try another name, or clear the filters to see everyone.</p>
              <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={clear}>Clear filters</button>
            </div>
          ) : (
            <>
              <ul className="doctor-grid" aria-label="Doctors">
                {shown.slice(0, limit).map((d) => <li key={d.id}><DoctorCard doctor={d} /></li>)}
              </ul>
              {shown.length > limit && (
                <div className="mt-8 grid justify-items-center gap-2">
                  <button type="button" className="btn btn-secondary" onClick={() => set({ n: String(limit + PAGE) }, true)}>Show more doctors</button>
                  <p className="fine">{Math.min(limit, shown.length)} of {shown.length} shown</p>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  )
}

function DoctorCard({ doctor: d }: { doctor: Doctor }) {
  return (
    // Only what picks a doctor: who, what they treat, languages, soonest time, price. Registration, experience
    // and approach are on the next screen (times and profile), before payment.
    <article className="card doctor-card p-5" aria-labelledby={`doc-${d.id}`}>
      <div className="flex items-center gap-3.5">
        <DoctorAvatar doctor={d} size={48} />
        <div className="min-w-0">
          <h2 id={`doc-${d.id}`} className="font-sans text-[17px] leading-snug font-medium tracking-[-0.01em]">{d.name}</h2>
          <p className="fine">{d.specialty}</p>
        </div>
      </div>
      <p className="mt-4 text-sm">Speaks {d.languages.split(LANG_JOINER).join(', ')}</p>
      {d.nextAvailableAt
        ? <p className="mt-1 mb-4 text-[13px] font-medium text-ok">Next: {when(d.nextAvailableAt)}</p>
        : <p className="fine mt-1 mb-4">No open times right now</p>}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-[17px] font-medium"><span className="sr-only">Fee </span>{euro(d.fee)}</span>
        <Link to={`/book/doctors/${d.id}/times`} className="btn btn-primary btn-sm">Book<span className="sr-only"> with {d.name}</span></Link>
      </div>
    </article>
  )
}

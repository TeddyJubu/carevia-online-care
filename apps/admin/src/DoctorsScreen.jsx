import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoctorSlot,
  createDoctor,
  getDoctor,
  listDoctorSlots,
  listDoctors,
  listServiceGroups,
  removeDoctorSlot,
  saveDoctor,
  sessionFailure,
} from './api.js'

const EMPTY = {
  name: '',
  specialty: '',
  languages: '',
  fee: '45',
  experience: '',
  education: '',
  approach: '',
  cedula: '',
  groupId: '',
  serviceId: '',
  active: true,
}

function lisbonToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function fromDoctor(doctor) {
  return {
    name: doctor.name,
    specialty: doctor.specialty,
    languages: doctor.languages,
    fee: String(doctor.fee),
    experience: doctor.experience,
    education: doctor.education,
    approach: doctor.approach,
    cedula: doctor.cedula,
    groupId: String(doctor.groupId),
    serviceId: String(doctor.serviceId),
    active: doctor.active,
  }
}

function toPayload(form) {
  return {
    name: form.name.trim(),
    specialty: form.specialty.trim(),
    languages: form.languages.trim(),
    fee: Number(form.fee),
    experience: form.experience.trim(),
    education: form.education.trim(),
    approach: form.approach.trim(),
    cedula: form.cedula.trim(),
    groupId: Number(form.groupId),
    serviceId: Number(form.serviceId),
    active: form.active,
  }
}

export default function DoctorsScreen({ id, onSignOut, onDenied }) {
  if (id) return <DoctorEditor id={id} onSignOut={onSignOut} onDenied={onDenied} />
  return <DoctorList onSignOut={onSignOut} onDenied={onDenied} />
}

function DoctorList({ onSignOut, onDenied }) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState('loading')
  const [doctors, setDoctors] = useState([])
  const [error, setError] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      setState('loading')
      listDoctors(query)
        .then((data) => {
          if (!live) return
          setDoctors(data.doctors || [])
          setError('')
          setState('ready')
        })
        .catch((err) => {
          if (!live || sessionFailure(err, onSignOut, onDenied)) return
          setError(err.message)
          setState('error')
        })
    }, query ? 200 : 0)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, onSignOut, onDenied])

  return (
    <main className="page" id="main">
      <header className="page-head">
        <div>
          <h1>Doctors</h1>
          <p className="lede">
            Profiles patients can book. Open a doctor to edit their details and upcoming times. Times that have already passed are hidden.
          </p>
        </div>
        <a className="button button-link" href="#/doctors/new">Add a doctor</a>
      </header>
      <label className="field search-field">
        <span>Search by name, specialty, service, or cédula</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="For example, Laurent or dermatology"
        />
      </label>
      {error ? <p className="notice" data-tone="error" role="alert">{error}</p> : null}
      {state === 'loading' ? <ListSkeleton /> : null}
      {state === 'ready' ? <p className="count-line">{doctors.length === 1 ? '1 doctor' : `${doctors.length} doctors`}</p> : null}
      {state === 'ready' && doctors.length === 0 ? (
        query.trim() ? (
          <div className="empty-state doctors-empty">
            <p className="eyebrow">Search</p>
            <h2>No doctors match that search</h2>
            <p>Nothing matches “{query.trim()}”. Check the spelling, or try a specialty, a service, or a cédula number.</p>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="empty-state doctors-empty">
            <p className="eyebrow">Doctors</p>
            <h2>No doctors yet</h2>
            <p>Patients can only book doctors listed here. Add a doctor, then give them times on their page.</p>
            <a className="button" href="#/doctors/new">Add a doctor</a>
          </div>
        )
      ) : null}
      {state === 'ready' && doctors.length > 0 ? (
        <ul className="roster">
          {doctors.map((doctor) => (
            <li key={doctor.id}>
              <a href={`#/doctors/${doctor.id}`}>
                <span className="roster-title">{doctor.name}</span>
                <span className="roster-meta">{doctor.specialty} · {doctor.serviceName}</span>
                <span className="roster-meta">€{doctor.fee}</span>
                <span className="roster-count">
                  {doctor.upcomingSlotCount === 0
                    ? 'No upcoming times'
                    : doctor.upcomingSlotCount === 1
                      ? '1 upcoming time'
                      : `${doctor.upcomingSlotCount} upcoming times`}
                </span>
                <span className={doctor.active ? 'pill pill-on' : 'pill pill-off'}>{doctor.active ? 'Shown' : 'Hidden'}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  )
}

function DoctorEditor({ id, onSignOut, onDenied }) {
  const creating = id === 'new'
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [banner, setBanner] = useState(null)
  const [groups, setGroups] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [slots, setSlots] = useState([])
  const [when, setWhen] = useState({ date: '', time: '' })
  const [busy, setBusy] = useState('')
  const scheduleRef = useRef(null)
  const saveRef = useRef(null)
  const lastBusy = useRef('')
  const removeOrder = useRef([])

  // A finished action disables or removes the button that had focus. Put keyboard focus back somewhere sensible:
  // the same remove button if it is still there, else the nearest open time, else the date field.
  useEffect(() => {
    const finished = lastBusy.current
    lastBusy.current = busy
    if (busy !== '' || finished === '') return
    const active = document.activeElement
    if (active && active !== document.body && !active.disabled) return
    const root = scheduleRef.current
    if (finished === 'save') {
      saveRef.current?.focus()
      return
    }
    if (!root) return
    const byId = (slotId) => root.querySelector(`[data-slot-id="${slotId}"]`)
    if (finished.startsWith('remove-')) {
      const removedId = Number(finished.slice('remove-'.length))
      const order = removeOrder.current
      const at = order.indexOf(removedId)
      const candidates = [removedId, ...order.slice(at + 1), ...order.slice(0, Math.max(at, 0)).reverse()]
      for (const candidate of candidates) {
        const button = byId(candidate)
        if (button) {
          button.focus()
          return
        }
      }
    }
    root.querySelector('input[type="date"]')?.focus()
  }, [busy, slots])

  const services = useMemo(() => {
    const group = groups.find((item) => String(item.id) === form.groupId)
    return group?.services || []
  }, [groups, form.groupId])

  useEffect(() => {
    let live = true
    setState('loading')
    const doctorRequest = creating ? Promise.resolve(null) : getDoctor(id)
    Promise.all([listServiceGroups(), doctorRequest, creating ? Promise.resolve({ slots: [] }) : listDoctorSlots(id)])
      .then(([catalog, doctorData, slotData]) => {
        if (!live) return
        const nextGroups = catalog.groups || []
        setGroups(nextGroups)
        if (doctorData?.doctor) setForm(fromDoctor(doctorData.doctor))
        else if (nextGroups[0]) {
          setForm({
            ...EMPTY,
            groupId: String(nextGroups[0].id),
            serviceId: nextGroups[0].services[0] ? String(nextGroups[0].services[0].id) : '',
          })
        }
        setSlots(slotData.slots || [])
        setState('ready')
      })
      .catch((err) => {
        if (!live || sessionFailure(err, onSignOut, onDenied)) return
        setError(err.message)
        setState('error')
      })
    return () => {
      live = false
    }
  }, [creating, id, onSignOut, onDenied])

  function update(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'groupId') {
        const group = groups.find((item) => String(item.id) === value)
        const stillThere = group?.services.some((service) => String(service.id) === current.serviceId)
        next.serviceId = stillThere ? current.serviceId : String(group?.services[0]?.id || '')
      }
      return next
    })
  }

  async function onSave(event) {
    event.preventDefault()
    if (busy) return
    setBusy('save')
    setBanner(null)
    try {
      const payload = toPayload(form)
      if (creating) {
        const created = await createDoctor(payload)
        window.location.hash = `#/doctors/${created.doctor.id}`
        return
      }
      const saved = await saveDoctor(id, payload)
      setForm(fromDoctor(saved.doctor))
      setBanner({ tone: 'ok', text: 'Doctor saved.', where: 'profile' })
    } catch (err) {
      if (sessionFailure(err, onSignOut, onDenied)) return
      setBanner({ tone: 'error', text: err.message, where: 'profile' })
    } finally {
      setBusy('')
    }
  }

  async function onAddTime(event) {
    event.preventDefault()
    if (creating || busy) return
    setBusy('slot')
    setBanner(null)
    try {
      await addDoctorSlot(id, when)
      const next = await listDoctorSlots(id)
      setSlots(next.slots || [])
      setWhen({ date: '', time: '' })
      setBanner({ tone: 'ok', text: 'Time added. Patients can book it while it is still ahead.', where: 'schedule' })
    } catch (err) {
      if (sessionFailure(err, onSignOut, onDenied)) return
      setBanner({ tone: 'error', text: err.message, where: 'schedule' })
    } finally {
      setBusy('')
    }
  }

  async function onRemove(slot) {
    if (busy) return
    setBusy(`remove-${slot.id}`)
    setBanner(null)
    try {
      await removeDoctorSlot(id, slot.id)
      setSlots((current) => current.filter((item) => item.id !== slot.id))
      setBanner({ tone: 'ok', text: 'Time removed.', where: 'schedule' })
    } catch (err) {
      if (sessionFailure(err, onSignOut, onDenied)) return
      setBanner({ tone: 'error', text: err.message, where: 'schedule' })
    } finally {
      setBusy('')
    }
  }

  const days = []
  for (const slot of slots) {
    const existing = days.find((day) => day.label === slot.day)
    if (existing) existing.slots.push(slot)
    else days.push({ label: slot.day, slots: [slot] })
  }

  function removeTime(slot) {
    removeOrder.current = slots.filter((item) => !item.booked).map((item) => item.id)
    onRemove(slot)
  }

  return (
    <main className="page" id="main">
      <a className="back-link" href="#/doctors">All doctors</a>
      {state === 'loading' ? <EditorSkeleton /> : null}
      {state === 'error' ? <p className="notice" data-tone="error" role="alert">{error}</p> : null}
      {state === 'ready' ? (
        <>
          <header className="page-head">
            <div>
              <h1>{creating ? 'New doctor' : form.name || 'Doctor'}</h1>
              <p className="lede">
                Patients see the name, specialty, languages, cédula, and fee. Save the profile before adding times.
              </p>
            </div>
          </header>
          <form className="panel" onSubmit={onSave}>
            <h2>Profile</h2>
            <div className="form-grid">
              <label className="field">
                <span>Name</span>
                <input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Dr Ana Costa" required />
              </label>
              <label className="field">
                <span>Specialty</span>
                <input value={form.specialty} onChange={(event) => update('specialty', event.target.value)} required />
              </label>
              <label className="field">
                <span>Service group</span>
                <select value={form.groupId} onChange={(event) => update('groupId', event.target.value)} required>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Service</span>
                <select value={form.serviceId} onChange={(event) => update('serviceId', event.target.value)} required>
                  {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Fee (euros)</span>
                <input type="number" min="0" step="1" value={form.fee} onChange={(event) => update('fee', event.target.value)} required />
              </label>
              <label className="field">
                <span>Languages</span>
                <input value={form.languages} onChange={(event) => update('languages', event.target.value)} placeholder="Portuguese · English" required />
              </label>
              <label className="field">
                <span>Cédula</span>
                <input value={form.cedula} onChange={(event) => update('cedula', event.target.value)} placeholder="Ordem dos Médicos number" required />
              </label>
              <label className="field">
                <span>Experience</span>
                <input value={form.experience} onChange={(event) => update('experience', event.target.value)} placeholder="12 years" required />
              </label>
            </div>
            <label className="field">
              <span>Education</span>
              <textarea value={form.education} onChange={(event) => update('education', event.target.value)} rows={3} required />
            </label>
            <label className="field">
              <span>Approach</span>
              <textarea value={form.approach} onChange={(event) => update('approach', event.target.value)} rows={3} required />
            </label>
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} />
              <span>Shown on the patient portal. Hidden doctors keep their past bookings and cannot be newly booked.</span>
            </label>
            <div className="actions">
              <button ref={saveRef} className="button" type="submit" disabled={busy !== '' || form.groupId === '' || form.serviceId === ''}>
                {busy === 'save' ? 'Saving…' : creating ? 'Create doctor' : 'Save doctor'}
              </button>
            </div>
            {banner?.where === 'profile' ? <Notice banner={banner} /> : null}
          </form>
          <section className="panel schedule" ref={scheduleRef}>
            <div className="schedule-intro">
              <h2>Upcoming times</h2>
              <p className="help">
                Only times that have not started are listed. A booked time stays here until it passes, and it cannot be removed.
              </p>
            </div>
            {creating ? <p className="empty">Save the doctor first, then add times patients can book.</p> : (
              <div className="schedule-tools">
                <form className="inline-edit schedule-add" onSubmit={onAddTime}>
                  <label className="field">
                    <span>Date</span>
                    <input type="date" min={lisbonToday()} value={when.date} onChange={(event) => setWhen({ ...when, date: event.target.value })} required />
                  </label>
                  <label className="field">
                    <span>Time</span>
                    <input type="time" value={when.time} onChange={(event) => setWhen({ ...when, time: event.target.value })} required />
                  </label>
                  <button className="button" type="submit" disabled={busy !== '' || !when.date || !when.time}>
                    {busy === 'slot' ? 'Adding…' : 'Add time'}
                  </button>
                </form>
                {banner?.where === 'schedule' ? <Notice banner={banner} /> : null}
              </div>
            )}
            {!creating && days.length === 0 ? <p className="empty">No upcoming times. Add a date and time above.</p> : null}
            {days.length > 0 ? (
              <ul className="slot-days">
                {days.map((day) => (
                  <li key={day.label} className="slot-day">
                    <h3>{day.label}</h3>
                    <ul className="slot-chips">
                      {day.slots.map((slot) => {
                        const removing = busy === `remove-${slot.id}`
                        return (
                          <li key={slot.id} className="slot-row" data-state={slot.booked ? 'booked' : 'open'} data-busy={removing ? 'true' : undefined}>
                            <span className="slot-time">{slot.time}</span>
                            {slot.booked ? (
                              <span className="slot-booked">Booked{slot.patientName ? ` · ${slot.patientName}` : ''}</span>
                            ) : (
                              <>
                                <span className="visually-hidden">Open</span>
                                <button
                                  className="slot-remove"
                                  type="button"
                                  data-slot-id={slot.id}
                                  onClick={() => removeTime(slot)}
                                  disabled={busy !== ''}
                                  aria-label={`${removing ? 'Removing' : 'Remove'} ${slot.time}, ${day.label}`}
                                >
                                  {removing ? (
                                    <span className="slot-removing" aria-hidden="true">Removing…</span>
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
                                      <path d="M2 2l8 8M10 2l-8 8" />
                                    </svg>
                                  )}
                                </button>
                              </>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  )
}

function Notice({ banner }) {
  return (
    <p className="notice" data-tone={banner.tone} role={banner.tone === 'error' ? 'alert' : 'status'}>
      {banner.text}
    </p>
  )
}

function ListSkeleton() {
  return (
    <>
      <p className="visually-hidden" role="status">Loading doctors…</p>
      <div className="skeleton-panel doctors-skeleton" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="skeleton-row" key={index}>
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
        ))}
      </div>
    </>
  )
}

function EditorSkeleton() {
  return (
    <>
      <h1 className="visually-hidden">Doctor</h1>
      <p className="visually-hidden" role="status">Loading doctor…</p>
      <div className="editor-skeleton" aria-hidden="true">
        <div className="editor-skeleton-head">
          <span className="skeleton skeleton-title" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
        <div className="skeleton-panel">
          <span className="skeleton skeleton-title" />
          <div className="editor-skeleton-grid">
            {Array.from({ length: 8 }, (_, index) => (
              <div className="editor-skeleton-field" key={index}>
                <span className="skeleton" />
                <span className="skeleton" />
              </div>
            ))}
          </div>
          <span className="skeleton editor-skeleton-area" />
          <span className="skeleton editor-skeleton-area" />
          <span className="skeleton editor-skeleton-button" />
        </div>
      </div>
    </>
  )
}

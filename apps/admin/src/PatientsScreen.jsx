import { useEffect, useState } from 'react'
import { getPatient, listPatients, savePatient, sessionFailure } from './api.js'

function formatDate(iso) {
  if (!iso) return ''
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function channelLabel(channel) {
  if (channel === 'video') return 'Video'
  if (channel === 'audio') return 'Audio'
  return channel
}

export default function PatientsScreen({ id, onSignOut, onDenied }) {
  if (id) {
    return <PatientDetail id={id} onSignOut={onSignOut} onDenied={onDenied} />
  }
  return <PatientList onSignOut={onSignOut} onDenied={onDenied} />
}

function PatientList({ onSignOut, onDenied }) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState('loading')
  const [patients, setPatients] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      setState('loading')
      listPatients(query)
        .then((data) => {
          if (!live) return
          setPatients(data.patients || [])
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
          <h1>Patients</h1>
          <p className="lede">
            Registered people. Open a patient to correct contact details or review bookings. Passwords and clinical notes are not shown here.
          </p>
        </div>
      </header>
      <label className="field search-field">
        <span>Search by name, email, or phone</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="For example, Maria or +351"
        />
      </label>
      {error ? <p className="notice" data-tone="error" role="alert">{error}</p> : null}
      {state === 'loading' ? <p className="lede" role="status">Loading patients…</p> : null}
      {state === 'ready' && patients.length === 0 ? (
        <p className="empty">{query.trim() ? 'No patients match that search.' : 'No patients have registered yet.'}</p>
      ) : null}
      {state === 'ready' && patients.length > 0 ? (
        <ul className="roster">
          {patients.map((patient) => (
            <li key={patient.id}>
              <a href={`#/patients/${patient.id}`}>
                <span className="roster-title">{patient.firstName} {patient.lastName}</span>
                <span className="roster-meta">{patient.email}</span>
                <span className="roster-meta">{patient.phone}</span>
                <span className="roster-count">
                  {patient.appointmentCount === 1 ? '1 booking' : `${patient.appointmentCount} bookings`}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  )
}

function PatientDetail({ id, onSignOut, onDenied }) {
  const [state, setState] = useState('loading')
  const [patient, setPatient] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    setState('loading')
    getPatient(id)
      .then((data) => {
        if (!live) return
        setPatient(data.patient)
        setAppointments(data.appointments || [])
        setForm({
          firstName: data.patient.firstName,
          lastName: data.patient.lastName,
          email: data.patient.email,
          phone: data.patient.phone,
        })
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
  }, [id, onSignOut, onDenied])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function onSave(event) {
    event.preventDefault()
    if (!form || busy) return
    setBusy(true)
    setBanner(null)
    try {
      const saved = await savePatient(id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      })
      setPatient(saved.patient)
      setBanner({ tone: 'ok', text: 'Contact details saved.' })
    } catch (err) {
      if (sessionFailure(err, onSignOut, onDenied)) return
      setBanner({ tone: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page" id="main">
      <a className="back-link" href="#/patients">All patients</a>
      {state === 'loading' ? <p className="lede" role="status">Loading patient…</p> : null}
      {state === 'error' ? <p className="notice" data-tone="error" role="alert">{error}</p> : null}
      {state === 'ready' && patient && form ? (
        <>
          <header className="page-head">
            <div>
              <h1>{patient.firstName} {patient.lastName}</h1>
              <p className="lede">Born {formatDate(patient.dateOfBirth)}. Date of birth stays as registered.</p>
            </div>
          </header>
          <form className="panel" onSubmit={onSave}>
            <h2>Contact details</h2>
            {banner ? (
              <p className="notice" data-tone={banner.tone} role={banner.tone === 'error' ? 'alert' : 'status'}>
                {banner.text}
              </p>
            ) : null}
            <div className="form-grid">
              <label className="field">
                <span>First name</span>
                <input value={form.firstName} onChange={(event) => update('firstName', event.target.value)} required />
              </label>
              <label className="field">
                <span>Last name</span>
                <input value={form.lastName} onChange={(event) => update('lastName', event.target.value)} required />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} required />
              </label>
              <label className="field">
                <span>Phone</span>
                <input type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} required />
              </label>
            </div>
            <div className="actions">
              <button className="button" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save contact details'}
              </button>
            </div>
          </form>
          <section className="panel">
            <h2>Bookings</h2>
            {appointments.length === 0 ? <p className="empty">This patient has no bookings yet.</p> : null}
            {appointments.length > 0 ? (
              <ul className="booking-list">
                {appointments.map((booking) => (
                  <li key={booking.id}>
                    <strong>{booking.service}</strong>
                    <span>{booking.doctorName}</span>
                    <span>{booking.slot}</span>
                    <span>{channelLabel(booking.channel)}</span>
                    <span>€{booking.fee}</span>
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

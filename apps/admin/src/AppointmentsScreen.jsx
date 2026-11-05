import { useEffect, useState } from 'react'
import { getAppointments } from './api.js'

const STATUSES = ['', 'held', 'confirmed', 'completed', 'cancelled', 'expired']
const lisbonDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
const lisbonTime = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const words = (value) => (value ? value.replaceAll('_', ' ') : '—')

// Operational list only: the API sends no patient name, date of birth, phone or email, and no clinical data.
export default function AppointmentsScreen({ onAuthError }) {
  const [date, setDate] = useState(lisbonDate)
  const [status, setStatus] = useState('')
  const [state, setState] = useState({ phase: 'loading', rows: [], error: '' })

  useEffect(() => {
    let live = true
    setState((current) => ({ ...current, phase: 'loading' }))
    getAppointments({ date, status })
      .then((data) => live && setState({ phase: 'ready', rows: data.appointments, error: '' }))
      .catch((error) => {
        if (!live) return
        if (onAuthError(error)) return
        setState({ phase: 'error', rows: [], error: error.unreachable ? 'The API did not respond.' : error.message })
      })
    return () => {
      live = false
    }
  }, [date, status, onAuthError])

  return (
    <section className="card wide">
      <h1>Appointments</h1>
      <p className="lede">Operational status only. Clinical records are in iMED.</p>
      <div className="filters">
        <label className="field">
          <span>Day (Lisbon)</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((value) => <option key={value} value={value}>{value ? words(value) : 'Any'}</option>)}
          </select>
        </label>
      </div>
      {state.phase === 'error' ? <p className="notice" data-tone="error" role="alert">{state.error}</p> : null}
      <p className="help" role="status">
        {state.phase === 'loading' ? 'Loading…' : state.phase === 'ready' ? `${state.rows.length} appointment${state.rows.length === 1 ? '' : 's'}` : ''}
      </p>
      {state.rows.length ? (
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Appointments on {date}</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Status</th>
                <th scope="col">Outcome</th>
                <th scope="col">Service</th>
                <th scope="col">Doctor</th>
                <th scope="col">Call</th>
                <th scope="col">Payment</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.id}>
                  <td>{lisbonTime(row.startsAt)}</td>
                  <td>{words(row.status)}</td>
                  <td>{words(row.outcome)}</td>
                  <td>{row.service.name}</td>
                  <td>{row.doctor.name}</td>
                  <td>{words(row.call.state)}{row.call.reconnects ? ` (${row.call.reconnects} reconnect${row.call.reconnects === 1 ? '' : 's'})` : ''}</td>
                  <td>{row.payment ? `${row.payment.status} (${row.payment.method})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

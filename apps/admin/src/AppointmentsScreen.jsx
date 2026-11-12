import { useEffect, useState } from 'react'
import { cancelAppointment, getAppointments } from './api.js'

const STATUSES = ['', 'held', 'confirmed', 'completed', 'cancelled', 'expired']
const lisbonDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
const lisbonTime = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const words = (value) => (value ? value.replaceAll('_', ' ') : '—')

// Operational list only: the API sends no patient name, date of birth, phone or email, and no clinical data.
export default function AppointmentsScreen({ onAuthError }) {
  const [date, setDate] = useState(lisbonDate)
  const [status, setStatus] = useState('')
  // Needs attention: confirmed, join window closed, no outcome, on any day (say, the doctor didn't show).
  const [attention, setAttention] = useState(false)
  const [reload, setReload] = useState(0)
  const [cancelError, setCancelError] = useState('')
  const [state, setState] = useState({ phase: 'loading', rows: [], error: '' })

  useEffect(() => {
    let live = true
    setState((current) => ({ ...current, phase: 'loading' }))
    getAppointments(attention ? { needsAttention: true } : { date, status })
      .then((data) => live && setState({ phase: 'ready', rows: data.appointments, error: '' }))
      .catch((error) => {
        if (!live) return
        if (onAuthError(error)) return
        setState({ phase: 'error', rows: [], error: error.unreachable ? 'The API did not respond.' : error.message })
      })
    return () => {
      live = false
    }
  }, [date, status, attention, reload, onAuthError])

  return (
    <section className="card wide">
      <h1>Appointments</h1>
      <p className="lede">Operational status only. Clinical records are in iMED.</p>
      <div className="filters">
        <label className="field">
          <span>Day (Lisbon)</span>
          <input type="date" value={date} disabled={attention} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} disabled={attention} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((value) => <option key={value} value={value}>{value ? words(value) : 'Any'}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Needs attention</span>
          <input type="checkbox" checked={attention} onChange={(event) => setAttention(event.target.checked)} />
        </label>
      </div>
      {cancelError ? <p className="notice" data-tone="error" role="alert">{cancelError}</p> : null}
      {state.phase === 'error' ? <p className="notice" data-tone="error" role="alert">{state.error}</p> : null}
      <p className="help" role="status">
        {state.phase === 'loading' ? 'Loading…' : state.phase === 'ready' ? `${state.rows.length} appointment${state.rows.length === 1 ? '' : 's'}` : ''}
      </p>
      {state.rows.length ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Appointments table, scrolls sideways">
          <table>
            <caption className="visually-hidden">{attention ? 'Appointments that need attention' : `Appointments on ${date}`}</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Status</th>
                <th scope="col">Outcome</th>
                <th scope="col">Service</th>
                <th scope="col">Doctor</th>
                <th scope="col">Call</th>
                <th scope="col">Payment</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
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
                  <td>
                    {row.status === 'confirmed' ? (
                      <button type="button" className="button button-quiet" onClick={async () => {
                        if (!window.confirm(`Cancel the ${lisbonTime(row.startsAt)} visit with ${row.doctor.name}? The patient is emailed and refunded in full.`)) return
                        setCancelError('')
                        try {
                          await cancelAppointment(row.id)
                          setReload((n) => n + 1)
                        } catch (error) {
                          if (!onAuthError(error)) setCancelError(error.message)
                        }
                      }}>Cancel<span className="visually-hidden"> the {lisbonTime(row.startsAt)} visit</span></button>
                    ) : row.cancelledBy ? `by ${row.cancelledBy}` : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

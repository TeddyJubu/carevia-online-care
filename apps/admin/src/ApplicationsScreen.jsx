import { useEffect, useState } from 'react'
import { listDoctorApplications, sessionFailure, setDoctorApplicationStatus } from './api.js'

const STATUSES = ['new', 'contacted', 'approved', 'declined']
const BODIES = { medicos: 'Ordem dos Médicos', psicologos: 'Ordem dos Psicólogos', nutricionistas: 'Ordem dos Nutricionistas' }
const day = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

// Applications from the public "Join Carevia" form (/app/join). Approving does not create a login: after checking the
// cédula with the Ordem, add the doctor under Doctors and link their clinician account there.
export default function ApplicationsScreen({ onSignOut, onDenied }) {
  const [status, setStatus] = useState('new')
  const [state, setState] = useState({ phase: 'loading', rows: [], error: '' })

  useEffect(() => {
    let live = true
    setState((current) => ({ ...current, phase: 'loading' }))
    listDoctorApplications(status)
      .then((data) => live && setState({ phase: 'ready', rows: data.applications, error: '' }))
      .catch((error) => {
        if (!live || sessionFailure(error, onSignOut, onDenied)) return
        setState({ phase: 'error', rows: [], error: error.message })
      })
    return () => {
      live = false
    }
  }, [status, onSignOut, onDenied])

  const change = (row, next) => {
    setDoctorApplicationStatus(row.id, next)
      .then(({ application }) => setState((current) => ({
        ...current,
        // Moved out of the filtered status: drop it from this list.
        rows: current.rows.flatMap((r) => (r.id !== row.id ? [r] : !status || application.status === status ? [application] : [])),
      })))
      .catch((error) => {
        if (sessionFailure(error, onSignOut, onDenied)) return
        setState((current) => ({ ...current, error: error.message }))
      })
  }

  return (
    <main className="page" id="main">
      <section className="card wide">
        <h1>Doctor applications</h1>
        <p className="lede">From the Join Carevia form. Check the cédula with the Ordem, then add the doctor under Doctors.</p>
        <div className="filters">
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Any</option>
              {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
        {state.error ? <p className="notice" data-tone="error" role="alert">{state.error}</p> : null}
        <p className="help" role="status">
          {state.phase === 'loading' ? 'Loading…' : state.phase === 'ready' ? `${state.rows.length} application${state.rows.length === 1 ? '' : 's'}` : ''}
        </p>
        {state.rows.length ? (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Doctor applications table, scrolls sideways">
            <table>
              <caption className="visually-hidden">Doctor applications</caption>
              <thead>
                <tr>
                  <th scope="col">Received</th>
                  <th scope="col">Name</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Cédula</th>
                  <th scope="col">Specialty</th>
                  <th scope="col">Languages</th>
                  <th scope="col">Note</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{day(row.createdAt)}</td>
                    <td>{row.firstName} {row.lastName}</td>
                    <td><a href={`mailto:${row.email}`}>{row.email}</a><br /><a href={`tel:${row.phone}`}>{row.phone}</a></td>
                    <td>{row.cedula}<br /><span className="help">{BODIES[row.body] || row.body}</span></td>
                    <td>{row.specialty}<br /><span className="help">{row.yearsInPractice} yr{row.yearsInPractice === 1 ? '' : 's'}{row.groupSlug ? ` · ${row.groupSlug}` : ''}</span></td>
                    <td>{row.languages}</td>
                    <td>{row.message || '—'}</td>
                    <td>
                      <select aria-label={`Status for ${row.firstName} ${row.lastName}`} value={row.status} onChange={(event) => change(row, event.target.value)}>
                        {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  )
}

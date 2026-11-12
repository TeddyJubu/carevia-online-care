import { useEffect, useState } from 'react'
import { getDoctorApplication, inviteApplicant, listDoctorApplications, listServiceGroups, resendDoctorInvite, revokeDoctorInvite, sessionFailure, setApplicationCheck, setDoctorApplicationStatus } from './api.js'

const STATUSES = ['new', 'contacted', 'approved', 'declined']
const day = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
const when = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'short' }).format(new Date(iso))

// Applications from the public "Join Carevia" form (/app/join). Opening a row shows the whole application.
// Approving does not create a login: that waits for the verification checklist.
export default function ApplicationsScreen({ id, onSignOut, onDenied }) {
  if (id) return <ApplicationDetail id={id} onSignOut={onSignOut} onDenied={onDenied} />
  return <ApplicationList onSignOut={onSignOut} onDenied={onDenied} />
}

function ApplicationList({ onSignOut, onDenied }) {
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

  return (
    <main className="page" id="main">
      <section className="card wide">
        <h1>Doctor applications</h1>
        <p className="lede">From the Join Carevia form. Open an application to read it. Approving does not create a login.</p>
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
                    <td>
                      <a href={`#/applications/${row.id}`}>{row.firstName} {row.lastName}</a>
                      <br /><span className="help">{row.reference}</span>
                    </td>
                    <td><a href={`mailto:${row.email}`}>{row.email}</a><br /><a href={`tel:${row.phone}`}>{row.phone}</a></td>
                    <td>{row.cedula}<br /><span className="help">{row.bodyLabel || row.body}</span></td>
                    <td>{row.specialty}<br /><span className="help">{row.yearsInPractice} yr{row.yearsInPractice === 1 ? '' : 's'}{row.groupName ? ` · ${row.groupName}` : ''}</span></td>
                    <td>{row.languages}</td>
                    <td>{row.message || '—'}</td>
                    <td>{row.status}</td>
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

function InvitePanel({ row, onChange, onError }) {
  const login = row.login
  const [fee, setFee] = useState('45')
  const [slug, setSlug] = useState(row.groupSlug || '')
  const [groups, setGroups] = useState([])
  const [busy, setBusy] = useState(false)
  const doctorId = login?.profile?.id

  useEffect(() => {
    if (row.groupSlug || doctorId) return undefined
    let live = true
    listServiceGroups().then((data) => live && setGroups(data.groups || [])).catch(() => {})
    return () => { live = false }
  }, [row.groupSlug, doctorId])

  const run = (fn) => {
    setBusy(true)
    fn()
      .then(() => getDoctorApplication(row.id))
      .then(({ application }) => onChange(application))
      .catch((error) => onError(error.message))
      .finally(() => setBusy(false))
  }

  if (doctorId) {
    const invite = login.invite
    const account = login.account
    return (
      <div>
        <h2>Doctor login</h2>
        <p className="help">{login.profile.name} · {login.profile.shown ? 'Shown to patients' : 'Hidden. Goes live at the end of onboarding.'}</p>
        {account ? <p>Login: {account.email}</p> : <p>No login yet.</p>}
        {invite ? (
          <p className="help">
            Invite sent {day(invite.sentAt)}
            {invite.acceptedAt ? ` · password set ${day(invite.acceptedAt)}` : ''}
            {invite.revokedAt ? ` · revoked ${day(invite.revokedAt)}` : ''}
            {account ? ` · Email verified: ${account.emailVerified ? 'yes' : 'no'} · Two-factor: ${account.twoFactor ? 'on' : 'off'}` : ''}
          </p>
        ) : null}
        <div className="actions">
          <button type="button" className="button button-quiet" disabled={busy || Boolean(invite?.acceptedAt)} onClick={() => run(() => resendDoctorInvite(doctorId))}>Resend</button>
          <button type="button" className="button button-quiet" disabled={busy || Boolean(invite?.acceptedAt) || Boolean(invite?.revokedAt)} onClick={() => run(() => revokeDoctorInvite(doctorId))}>Revoke</button>
        </div>
        <p className="help">One login per doctor. A patient account cannot become a clinician account here.</p>
      </div>
    )
  }

  if (row.status !== 'approved') {
    return (
      <div>
        <h2>Doctor login</h2>
        <p className="help">No login yet. Approve is a decision and creates nothing. The invite, after approval, creates the hidden profile and the clinician login.</p>
      </div>
    )
  }

  return (
    <form onSubmit={(event) => {
      event.preventDefault()
      const body = { fee: Number(fee) }
      if (!row.groupSlug) body.groupSlug = slug
      run(() => inviteApplicant(row.id, body))
    }}>
      <h2>Doctor login</h2>
      <p className="help">Send an invite to set up the doctor’s login. The profile stays hidden until they finish setup.</p>
      <label className="field">
        <span>Fee (euros)</span>
        <input type="number" min="1" max="500" value={fee} onChange={(event) => setFee(event.target.value)} required />
      </label>
      {row.groupSlug ? <p className="help">Area: {row.groupName}</p> : (
        <label className="field">
          <span>Area of care</span>
          <select value={slug} onChange={(event) => setSlug(event.target.value)} required>
            <option value="">Choose one</option>
            {groups.map((group) => <option key={group.slug} value={group.slug}>{group.name}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        <span>Invite email</span>
        <input value={row.email} readOnly />
      </label>
      <button type="submit" className="button" disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
    </form>
  )
}

function ApplicationDetail({ id, onSignOut, onDenied }) {
  const [state, setState] = useState({ phase: 'loading', application: null, error: '' })

  useEffect(() => {
    let live = true
    getDoctorApplication(id)
      .then((data) => live && setState({ phase: 'ready', application: data.application, error: '' }))
      .catch((error) => {
        if (!live || sessionFailure(error, onSignOut, onDenied)) return
        setState({ phase: 'error', application: null, error: error.message })
      })
    return () => {
      live = false
    }
  }, [id, onSignOut, onDenied])

  const change = (status) => {
    setDoctorApplicationStatus(id, status)
      .then(({ application }) => setState({ phase: 'ready', application, error: '' }))
      .catch((error) => {
        if (sessionFailure(error, onSignOut, onDenied)) return
        setState((current) => ({ ...current, error: error.message }))
      })
  }

  const tick = (key, checked) => {
    setState((current) => ({
      ...current,
      error: '',
      application: current.application && {
        ...current.application,
        readyToApprove: false,
        checks: current.application.checks.map((item) => (item.key === key ? { ...item, checked } : item)),
      },
    }))
    setApplicationCheck(id, key, checked)
      .then(({ application }) => setState({ phase: 'ready', application, error: '' }))
      .catch((error) => {
        if (sessionFailure(error, onSignOut, onDenied)) return
        setState((current) => ({ ...current, error: error.message }))
        getDoctorApplication(id).then((data) => setState({ phase: 'ready', application: data.application, error: error.message })).catch(() => {})
      })
  }

  const row = state.application
  return (
    <main className="page" id="main">
      <p><a className="back-link" href="#/applications">All applications</a></p>
      {state.error ? <p className="notice" data-tone="error" role="alert">{state.error}</p> : null}
      {state.phase === 'loading' ? <p className="lede" role="status">Loading the application…</p> : null}
      {row ? (
        <section className="card wide">
          <p className="help">Doctor applications · {row.reference}</p>
          <h1>{row.firstName} {row.lastName}</h1>
          <p className="lede">Received {day(row.createdAt)} · {row.bodyLabel} · Cédula {row.cedula}</p>
          <div className="application-facts">
            <div>
              <h2>Contact</h2>
              <p><a href={`mailto:${row.email}`}>{row.email}</a></p>
              <p><a href={`tel:${row.phone}`}>{row.phone}</a></p>
            </div>
            <div>
              <h2>Practice</h2>
              <p>{row.specialty}</p>
              <p className="help">{row.yearsInPractice} years · {row.languages}</p>
              <p className="help">Area: {row.groupName || 'Not sure yet'}</p>
            </div>
            <div>
              <h2>Anything else</h2>
              <p>{row.message || 'No note on the form.'}</p>
            </div>
          </div>
          <div>
            <h2>Verification</h2>
            <p className="help">Tick each item as you check it. Each tick records who checked it, and when. These are launch gates: a cédula checked with the Ordem, identity, specialty, insurance, and the introductory call. Approve records the decision and creates no login.</p>
            <ul className="check-list">
              {(row.checks || []).map((item) => (
                <li key={item.key}>
                  <label className="check-row">
                    <input type="checkbox" checked={item.checked} onChange={(event) => tick(item.key, event.target.checked)} />
                    <span>
                      <strong>{item.label}</strong>
                      <span className="help">{item.hint}</span>
                      {item.checked ? <span className="help">{item.checkedByName} · {when(item.checkedAt)}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="help">Decline stores no reason. The applicant gets a plain email once email sending is on.</p>
            <div className="actions">
              <button type="button" className="button button-quiet" disabled={row.status === 'contacted'} onClick={() => change('contacted')}>Contacted</button>
              <button type="button" className="button" disabled={!row.readyToApprove || row.status === 'approved'} onClick={() => change('approved')}>Approve</button>
              <button type="button" className="button button-quiet" disabled={row.status === 'declined'} onClick={() => change('declined')}>Decline</button>
            </div>
            <p className="help" role="status">Current status: {row.status}{row.readyToApprove ? '' : '. Approve stays off until every required check is ticked.'}</p>
          </div>
          <InvitePanel row={row} onChange={(application) => setState({ phase: 'ready', application, error: '' })} onError={(message) => setState((current) => ({ ...current, error: message }))} />
        </section>
      ) : null}
    </main>
  )
}

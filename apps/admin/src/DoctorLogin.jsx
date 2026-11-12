import { useEffect, useState } from 'react'
import { getDoctorLogin, inviteDoctor, resendDoctorInvite, revokeDoctorInvite } from './api.js'

const day = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

// The same invite as an approved application, for doctors who were seeded or added by hand.
export default function DoctorLogin({ id }) {
  const [login, setLogin] = useState(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    getDoctorLogin(id)
      .then((data) => live && setLogin(data.login))
      .catch((err) => live && setError(err.message))
    return () => { live = false }
  }, [id])

  const run = (fn) => {
    setBusy(true)
    setError('')
    fn().then((data) => setLogin(data.login)).catch((err) => setError(err.message)).finally(() => setBusy(false))
  }

  if (!login) return error ? <p className="notice" data-tone="error" role="alert">{error}</p> : null
  const account = login.account
  const invite = login.invite

  return (
    <section className="panel">
      <h2>Login</h2>
      {error ? <p className="notice" data-tone="error" role="alert">{error}</p> : null}
      <p className="help">{login.profile.shown ? 'Shown to patients.' : 'Hidden from patients until onboarding finishes.'}</p>
      {account ? (
        <>
          <p>Login: {account.email}</p>
          <p className="help">
            Email verified: {account.emailVerified ? 'yes' : 'no'} · Two-factor: {account.twoFactor ? 'on' : 'off'}
            {invite?.sentAt ? ` · Invite sent ${day(invite.sentAt)}` : ''}
            {invite?.acceptedAt ? ` · Password set ${day(invite.acceptedAt)}` : ''}
          </p>
          {invite && !invite.acceptedAt ? (
            <div className="actions">
              <button type="button" className="button button-quiet" disabled={busy} onClick={() => run(() => resendDoctorInvite(id))}>Resend</button>
              <button type="button" className="button button-quiet" disabled={busy || Boolean(invite.revokedAt)} onClick={() => run(() => revokeDoctorInvite(id))}>Revoke</button>
            </div>
          ) : null}
        </>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); run(() => inviteDoctor(id, email.trim())) }}>
          <p className="help">No login yet. Send an invite to create one, linked to this profile.</p>
          <label className="field">
            <span>Invite email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <button type="submit" className="button" disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
        </form>
      )}
      <p className="help">One login per doctor. A patient account cannot become a clinician account here.</p>
    </section>
  )
}

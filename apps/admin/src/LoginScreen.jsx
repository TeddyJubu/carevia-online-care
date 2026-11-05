import { useState } from 'react'
import { getSession, login } from './api.js'

export default function LoginScreen({ unreachable, onSession }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      await login(email.trim(), password)
      const session = await getSession()
      setPassword('')
      if (!session.user && !session.forbidden) {
        setError('The server did not keep the session. Check that the API allows this site to use cookies.')
        return
      }
      onSession(session)
    } catch (err) {
      const message = err.unreachable
        ? 'The API at localhost:4000 did not respond. Signing in needs the API.'
        : err.message
      setError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="split">
      <aside className="rail">
        <p className="wordmark">Carevia</p>
        <div className="rail-copy">
          <p className="eyebrow">Operations</p>
          <h1>Patients, doctors, and care.</h1>
          <p>
            Manage registered patients, the doctors they can book, the services on the portal, and the Daily key for video.
          </p>
        </div>
        <p className="rail-foot">The full key is not shown again after it is saved.</p>
      </aside>
      <main className="pane" id="main">
        <form className="card" onSubmit={onSubmit} noValidate>
          <h2>Sign in</h2>
          <p className="lede">Use an admin account. Patient accounts stay on the patient portal.</p>
          {unreachable ? (
            <p className="notice" role="status">
              The API at localhost:4000 did not respond. This screen is ready. Signing in needs the API.
            </p>
          ) : null}
          {error ? (
            <p className="notice" data-tone="error" role="alert">
              {error}
            </p>
          ) : null}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="button" type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="demo">
            <p>Seeded demo account</p>
            <dl>
              <div>
                <dt>Email</dt>
                <dd>admin@carevia.test</dd>
              </div>
              <div>
                <dt>Password</dt>
                <dd>admin-demo-password</dd>
              </div>
            </dl>
          </div>
        </form>
      </main>
    </div>
  )
}

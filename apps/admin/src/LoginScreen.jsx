import { useEffect, useState } from 'react'
import { getDemoAdmin, login } from './api.js'
import mark from './assets/carevia-mark.png'

export default function LoginScreen({ unreachable, onSignedIn, onTwoFactor }) {
  const [demo, setDemo] = useState(null)
  useEffect(() => {
    getDemoAdmin().then(setDemo)
  }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const data = await login(email.trim(), password)
      setPassword('')
      if (data?.twoFactorRedirect) onTwoFactor()
      else onSignedIn()
    } catch (err) {
      const message = err.unreachable
        ? 'The API did not respond. Signing in needs the API.'
        : err.message
      setError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="split">
      <aside className="rail">
        <p className="wordmark"><img src={mark} alt="" width="32" height="32" />Carevia</p>
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
              The API did not respond. This screen is ready. Signing in needs the API.
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
          {demo ? (
            <div className="demo">
              <p>Demo account (demo mode only)</p>
              <dl>
                <div>
                  <dt>Email</dt>
                  <dd>{demo.email}</dd>
                </div>
                <div>
                  <dt>Password</dt>
                  <dd>{demo.password}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </form>
      </main>
    </div>
  )
}

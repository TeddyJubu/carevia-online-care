import { useState } from 'react'
import { enableTwoFactor, verifyTotp } from './api.js'

// mode "verify": the sign-in asked for a code. mode "setup": the account must turn two-factor login on first.
export default function TwoFactorScreen({ mode, onDone, onSignOut }) {
  const [password, setPassword] = useState('')
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function run(action) {
    setError('')
    setPending(true)
    try {
      await action()
    } catch (err) {
      setError(err.unreachable ? 'The API did not respond.' : err.message)
    } finally {
      setPending(false)
    }
  }

  const onStart = (event) => {
    event.preventDefault()
    run(async () => {
      const data = await enableTwoFactor(password)
      setPassword('')
      setSetup({ uri: data.totpURI, backupCodes: data.backupCodes || [] })
    })
  }

  const onVerify = (event) => {
    event.preventDefault()
    run(async () => {
      await verifyTotp(code.replace(/\s/g, ''))
      setCode('')
      onDone()
    })
  }

  const needsPassword = mode === 'setup' && !setup

  return (
    <main className="gate" id="main">
      <section className="card gate-card">
        <p className="eyebrow">Operations</p>
        <h1>{mode === 'setup' ? 'Turn on two-factor login' : 'Enter your code'}</h1>
        <p className="lede">
          {mode === 'setup'
            ? 'Admin accounts need an authenticator app. Confirm your password, add the key to the app, then enter the 6-digit code it shows.'
            : 'Open your authenticator app and enter the 6-digit code for Carevia.'}
        </p>
        {error ? <p className="notice" data-tone="error" role="alert">{error}</p> : null}

        {needsPassword ? (
          <form onSubmit={onStart}>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button className="button" type="submit" disabled={pending || !password}>{pending ? 'Checking…' : 'Continue'}</button>
          </form>
        ) : (
          <form onSubmit={onVerify}>
            {setup ? (
              <>
                <label className="field">
                  <span>Key for your authenticator app</span>
                  <input readOnly value={setup.uri} onFocus={(event) => event.target.select()} spellCheck={false} translate="no" />
                </label>
                <p className="help">Paste this into the app, or choose to enter a setup key by hand.</p>
                {setup.backupCodes.length ? (
                  <div className="demo">
                    <p>Backup codes. Store them somewhere safe; each works once.</p>
                    <p translate="no">{setup.backupCodes.join('  ')}</p>
                  </div>
                ) : null}
              </>
            ) : null}
            <label className="field">
              <span>6-digit code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </label>
            <button className="button" type="submit" disabled={pending || code.replace(/\s/g, '').length !== 6}>
              {pending ? 'Checking…' : 'Confirm'}
            </button>
          </form>
        )}
        <button className="button button-quiet" type="button" onClick={onSignOut}>Sign out</button>
      </section>
    </main>
  )
}

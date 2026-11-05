import { useCallback, useEffect, useState } from 'react'
import { getDaily, getSession, logout } from './api.js'
import AppointmentsScreen from './AppointmentsScreen.jsx'
import DailyScreen from './DailyScreen.jsx'
import DeniedScreen from './DeniedScreen.jsx'
import LoginScreen from './LoginScreen.jsx'
import TwoFactorScreen from './TwoFactorScreen.jsx'

// Phases: checking, login, verify (two-factor code after sign-in), setup (two-factor required), denied, desk.
export default function App() {
  const [phase, setPhase] = useState('checking')
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState('appointments')
  const [unreachable, setUnreachable] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const session = await getSession()
      setUnreachable(false)
      setUser(session.user)
      if (!session.user) return setPhase('login')
      if (session.forbidden) return setPhase('denied')
      // Outside demo mode the API refuses admins without two-factor login; ask before showing the desk.
      await getDaily()
      setPhase('desk')
    } catch (error) {
      if (error.code === 'TWO_FACTOR_REQUIRED') return setPhase('setup')
      if (error.status === 403) return setPhase('denied')
      setUnreachable(Boolean(error.unreachable))
      setPhase(error.unreachable ? 'login' : 'desk')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // The cookie may already be gone. Return to the sign-in screen either way.
    }
    setUser(null)
    setPhase('login')
  }, [])

  // Screens call this on an API error; it returns true when the error changed the phase.
  const onAuthError = useCallback((error) => {
    if (error.status === 401) {
      setPhase('login')
      return true
    }
    if (error.code === 'TWO_FACTOR_REQUIRED') {
      setPhase('setup')
      return true
    }
    if (error.status === 403) {
      setPhase('denied')
      return true
    }
    return false
  }, [])

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      {phase === 'checking' ? (
        <main className="gate" id="main"><p className="gate-status" role="status">Checking the session…</p></main>
      ) : null}
      {phase === 'login' ? <LoginScreen unreachable={unreachable} onSignedIn={refresh} onTwoFactor={() => setPhase('verify')} /> : null}
      {phase === 'verify' || phase === 'setup' ? <TwoFactorScreen mode={phase} onDone={refresh} onSignOut={signOut} /> : null}
      {phase === 'denied' ? <DeniedScreen user={user} onSignOut={signOut} /> : null}
      {phase === 'desk' ? (
        <div className="desk">
          <header className="desk-bar">
            <p className="wordmark">Carevia</p>
            <nav className="tabs" aria-label="Operations">
              <button type="button" className="tab" aria-current={tab === 'appointments' ? 'page' : undefined} onClick={() => setTab('appointments')}>
                Appointments
              </button>
              <button type="button" className="tab" aria-current={tab === 'video' ? 'page' : undefined} onClick={() => setTab('video')}>
                Video (Daily)
              </button>
            </nav>
            <p className="desk-user">{user?.email || 'Admin'}</p>
            <button className="button button-quiet" type="button" onClick={signOut}>Sign out</button>
          </header>
          <main className="desk-main" id="main">
            {tab === 'appointments'
              ? <AppointmentsScreen onAuthError={onAuthError} />
              : <DailyScreen onSignOut={signOut} onDenied={refresh} />}
          </main>
        </div>
      ) : null}
    </>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { getDaily, getSession, logout } from './api.js'
import ApplicationsScreen from './ApplicationsScreen.jsx'
import AppointmentsScreen from './AppointmentsScreen.jsx'
import DailyScreen from './DailyScreen.jsx'
import DeniedScreen from './DeniedScreen.jsx'
import DoctorsScreen from './DoctorsScreen.jsx'
import LoginScreen from './LoginScreen.jsx'
import PatientsScreen from './PatientsScreen.jsx'
import { parseRoute } from './route.js'
import ServicesScreen from './ServicesScreen.jsx'
import Shell from './Shell.jsx'
import TwoFactorScreen from './TwoFactorScreen.jsx'

// Phases: checking, login, verify (two-factor code after sign-in), setup (two-factor required), denied, desk.
export default function App() {
  const [phase, setPhase] = useState('checking')
  const [user, setUser] = useState(null)
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
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

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

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
        <Shell user={user} section={route.section} onSignOut={signOut}>
          {route.section === 'appointments' ? (
            <main className="page" id="main"><AppointmentsScreen onAuthError={onAuthError} /></main>
          ) : null}
          {route.section === 'patients' ? <PatientsScreen id={route.id} onSignOut={signOut} onDenied={refresh} /> : null}
          {route.section === 'doctors' ? <DoctorsScreen id={route.id} onSignOut={signOut} onDenied={refresh} /> : null}
          {route.section === 'services' ? <ServicesScreen id={route.id} onSignOut={signOut} onDenied={refresh} /> : null}
          {route.section === 'applications' ? <ApplicationsScreen id={route.id} onSignOut={signOut} onDenied={refresh} /> : null}
          {route.section === 'daily' ? (
            <main className="page" id="main"><DailyScreen onSignOut={signOut} onDenied={refresh} /></main>
          ) : null}
        </Shell>
      ) : null}
    </>
  )
}

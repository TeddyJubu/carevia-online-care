import { useEffect, useState } from 'react'
import { getSession, logout } from './api.js'
import DailyScreen from './DailyScreen.jsx'
import DeniedScreen from './DeniedScreen.jsx'
import DoctorsScreen from './DoctorsScreen.jsx'
import LoginScreen from './LoginScreen.jsx'
import PatientsScreen from './PatientsScreen.jsx'
import { parseRoute } from './route.js'
import ServicesScreen from './ServicesScreen.jsx'
import Shell from './Shell.jsx'

export default function App() {
  const [phase, setPhase] = useState('checking')
  const [user, setUser] = useState(null)
  const [unreachable, setUnreachable] = useState(false)
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))

  useEffect(() => {
    let live = true
    getSession()
      .then((session) => {
        if (live) applySession(session)
      })
      .catch((error) => {
        if (!live) return
        setUnreachable(Boolean(error.unreachable))
        setUser(null)
        setPhase('login')
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    if (!window.location.hash) window.location.hash = '#/patients'
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  function applySession(session) {
    setUnreachable(Boolean(session.unreachable))
    if (session.user?.role === 'admin' && !session.forbidden) {
      setUser(session.user)
      setPhase('settings')
      return
    }
    if (session.forbidden) {
      setUser(session.user)
      setPhase('denied')
      return
    }
    setUser(null)
    setPhase('login')
  }

  async function signOut() {
    try {
      await logout()
    } catch {
      // The cookie may already be gone. Return to the sign-in screen either way.
    }
    setUser(null)
    setUnreachable(false)
    setPhase('login')
  }

  function deny() {
    applySession({ user, forbidden: true })
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {phase === 'checking' ? <Checking /> : null}
      {phase === 'login' ? (
        <LoginScreen unreachable={unreachable} onSession={applySession} />
      ) : null}
      {phase === 'denied' ? <DeniedScreen user={user} onSignOut={signOut} /> : null}
      {phase === 'settings' ? (
        <Shell user={user} section={route.section} onSignOut={signOut}>
          {route.section === 'patients' ? <PatientsScreen id={route.id} onSignOut={signOut} onDenied={deny} /> : null}
          {route.section === 'doctors' ? <DoctorsScreen id={route.id} onSignOut={signOut} onDenied={deny} /> : null}
          {route.section === 'services' ? <ServicesScreen id={route.id} onSignOut={signOut} onDenied={deny} /> : null}
          {route.section === 'daily' ? <DailyScreen embedded onSignOut={signOut} onDenied={deny} /> : null}
        </Shell>
      ) : null}
    </>
  )
}

function Checking() {
  return (
    <main className="gate" id="main">
      <p className="gate-status" role="status">
        Checking the session…
      </p>
    </main>
  )
}

import { useEffect, useState } from 'react'
import { getSession, logout } from './api.js'
import DailyScreen from './DailyScreen.jsx'
import DeniedScreen from './DeniedScreen.jsx'
import LoginScreen from './LoginScreen.jsx'

export default function App() {
  const [phase, setPhase] = useState('checking')
  const [user, setUser] = useState(null)
  const [unreachable, setUnreachable] = useState(false)

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
        <DailyScreen user={user} onSignOut={signOut} onDenied={() => applySession({ user, forbidden: true })} />
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

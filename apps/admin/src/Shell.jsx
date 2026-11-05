import { useEffect, useState } from 'react'
import mark from './assets/carevia-mark.png'

const NAV = [
  { id: 'appointments', label: 'Appointments' },
  { id: 'patients', label: 'Patients' },
  { id: 'doctors', label: 'Doctors' },
  { id: 'services', label: 'Services' },
  { id: 'daily', label: 'Video (Daily)' },
]

// The homepage's floating glass topbar. Wide screens show the sections inline; narrow screens fold them into the
// homepage's white menu panel behind a Menu pill. The open state is UI only and closes on navigation or Escape.
export default function Shell({ user, section, onSignOut, children }) {
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    setMenu(false)
  }, [section])

  useEffect(() => {
    if (!menu) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setMenu(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  return (
    <div className="shell">
      <header className="desk-head">
        <div className="topbar">
          <button
            className="nav-pill menu-toggle"
            type="button"
            aria-expanded={menu}
            aria-controls="admin-menu"
            onClick={() => setMenu((open) => !open)}
          >
            <span className="menu-lines" aria-hidden="true" />
            Menu
          </button>
          <p className="nav-pill nav-brand">
            <img src={mark} alt="" width="28" height="28" />
            <span>Carevia</span>
          </p>
          <nav id="admin-menu" className="nav-pill nav-sections" aria-label="Admin" data-open={menu}>
            <p className="menu-label">Operations</p>
            {NAV.map((item) => (
              <a key={item.id} href={`#/${item.id}`} aria-current={section === item.id ? 'page' : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
          <button className="nav-pill nav-signout" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
        <div className="menu-backdrop" hidden={!menu} onClick={() => setMenu(false)} />
        <div className="desk-strip">
          <p className="eyebrow">Carevia operations</p>
          <p className="desk-user">{user?.email || 'Admin'}</p>
        </div>
      </header>
      <div className="workspace">{children}</div>
    </div>
  )
}

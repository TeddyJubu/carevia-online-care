const NAV = [
  { id: 'appointments', label: 'Appointments' },
  { id: 'patients', label: 'Patients' },
  { id: 'doctors', label: 'Doctors' },
  { id: 'services', label: 'Services' },
  { id: 'daily', label: 'Video (Daily)' },
]

export default function Shell({ user, section, onSignOut, children }) {
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-top">
          <p className="wordmark">Carevia</p>
          <p className="side-kicker">Operations</p>
          <nav className="side-nav" aria-label="Admin">
            {NAV.map((item) => (
              <a key={item.id} href={`#/${item.id}`} aria-current={section === item.id ? 'page' : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="side-foot">
          <p className="side-user">{user?.email || 'Admin'}</p>
          <button className="button button-quiet" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="workspace">{children}</div>
    </div>
  )
}

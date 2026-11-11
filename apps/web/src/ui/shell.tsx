import { useEffect, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { ADMIN_HOME, homeFor, SITE, useSession } from '../lib/session'
import type { Role, User } from '../lib/types'
import { Loading } from './kit'

// The homepage (Design 04.5) lives at the site root, outside /app/. Signed in, it sends visitors to their home
// unless the link says ?site.
const homepage = (signedIn: boolean) => (signedIn ? SITE : '/')
// The logo opens your own home when signed in (patient account, doctor agenda, admin desk), else the homepage.
// A plain <a> outside the router, so /app/ paths carry the basename and the admin app gets a full load.
const logoHref = (user: User | null) => (!user ? '/' : user.role === 'admin' ? ADMIN_HOME : `/app${homeFor(user)}`)

/** "Go to your …" for whoever is signed in: patient account, doctor agenda, or the admin app (a full page load). */
export function HomeButton({ className = 'btn btn-primary' }: { className?: string }) {
  const { user } = useSession()
  if (user?.role === 'admin') return <a href={ADMIN_HOME} className={className}>Go to the admin desk</a>
  return user?.role === 'clinician'
    ? <Link to="/doctor" className={className}>Go to your agenda</Link>
    : <Link to="/account" className={className}>Go to your account</Link>
}

export function Header() {
  const { user, signOut } = useSession()
  const navigate = useNavigate()
  return (
    <header className="app-header on-navy">
      <div className="app-header-inner">
        <a href={logoHref(user)} className="brand" aria-label="Carevia home">
          <img src="/app/brand/carevia-mark.png" alt="" width={34} height={34} />
          <span>Carevia</span>
        </a>
        <span className="flex-1" />
        {user && <a href={SITE} className="nav-pill nav-link">Site</a>}
        <NavLink to="/doctors" className="nav-pill nav-link">Doctors</NavLink>
        {user?.role === 'patient' && <NavLink to="/appointments" className="nav-pill nav-link hidden sm:inline-flex">Appointments</NavLink>}
        {user
          ? <button type="button" className="nav-pill glass cursor-pointer" onClick={async () => { await signOut(); navigate('/signin') }}>Sign out</button>
          : <Link to="/signin" className="nav-pill glass">Sign in</Link>}
      </div>
    </header>
  )
}

/** The homepage footer (Design 04.5), copied so every page on the site ends the same way. Section links go back to the homepage. */
export function Footer() {
  const { user } = useSession()
  const home = homepage(!!user)
  return (
    <footer className="app-footer on-navy">
      <div className="footer-grid">
        <div className="footer-copyright">
          <a href={home} className="footer-brand">
            <span className="footer-mark"><img src={`${import.meta.env.BASE_URL}brand/carevia-iridescent-400.webp`} alt="" width="1600" height="1600" /></span>
            <span>Carevia</span>
          </a>
          <p>© 2026 Carevia<br />Thoughtful care. More room for living.</p>
        </div>
        <div>
          <h2>Your next<br />step starts<br />here.</h2>
          <Link to="/book" className="footer-cta">Find your care</Link>
        </div>
        <div className="footer-info">
          <p className="footer-label">The care</p>
          <a href={`${home}#care`}>Everyday health</a>
          <a href={`${home}#care`}>Mental wellbeing</a>
          <a href={`${home}#care`}>Specialist support</a>
          <p className="footer-label">The conversation</p>
          <a href={`${home}#how`}>How it works</a>
          <a href={`${home}#help`}>Questions &amp; answers</a>
        </div>
        <div className="footer-info">
          <p className="footer-label">Stay connected</p>
          <p>Online consultations.<br />Availability varies by country.</p>
          <p className="footer-label">For doctors</p>
          <Link to="/join">Register as a doctor</Link>
        </div>
      </div>
      <p className="footer-wordmark" aria-hidden="true">CAREVIA</p>
    </footer>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <Header />
      {/* At least a screen tall, so the footer never starts in view and jumps as the page loads (CLS). */}
      <main id="main" className="min-h-svh">
        <Outlet />
      </main>
      <Footer />
    </>
  )
}

/** Sends visitors without the right role to sign in, then back here. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useSession()
  const { pathname, search } = useLocation()
  if (loading) return <div className="page-narrow"><Loading label="Checking your session" /></div>
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(pathname + search)}`} replace />
  if (user.role !== role) {
    return (
      <div className="page-narrow">
        <h1>This page is for {role === 'clinician' ? 'doctors' : 'patients'}</h1>
        <p className="lede mt-4">You’re signed in as {user.email}. Sign out and sign in with the right account.</p>
        <HomeButton className="btn btn-primary mt-6" />
      </div>
    )
  }
  return <>{children}</>
}

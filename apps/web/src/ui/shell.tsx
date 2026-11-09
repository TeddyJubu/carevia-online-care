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

export function Footer() {
  const { user } = useSession()
  const clinician = user?.role === 'clinician'
  const admin = user?.role === 'admin'
  return (
    <footer className="app-footer on-navy">
      <div className="mx-auto grid w-[min(1200px,calc(100%-32px))] gap-10 md:grid-cols-3">
        <div>
          <p className="text-[22px] font-semibold tracking-[-0.04em]">Carevia</p>
          <p className="mt-3 text-sm text-[#c0d2e7]">Online doctor consultations for patients in mainland Portugal.</p>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Emergencies</p>
          <p className="text-[#c0d2e7]">Not an emergency service. In an emergency, call <a href="tel:112" className="link text-white">112</a>.</p>
        </div>
        <nav aria-label="Footer" className="text-sm">
          <p className="eyebrow mb-1">Carevia</p>
          <ul className="grid">
            <li><a href={homepage(!!user)} className="inline-flex min-h-11 items-center">Homepage</a></li>
            {admin ? <li><a href={ADMIN_HOME} className="inline-flex min-h-11 items-center">Admin desk</a></li> : clinician ? <li><Link to="/doctor" className="inline-flex min-h-11 items-center">Your agenda</Link></li> : <>
              <li><Link to="/book" className="inline-flex min-h-11 items-center">Book a visit</Link></li>
              <li><Link to="/account" className="inline-flex min-h-11 items-center">Your account</Link></li>
            </>}
          </ul>
        </nav>
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

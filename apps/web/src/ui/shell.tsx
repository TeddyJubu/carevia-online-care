import { useEffect, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { MOCK } from '../lib/api'
import { content, plain } from '../lib/content'
import { DEMO_BUILD, useDemo } from '../lib/demo'
import { useSession } from '../lib/session'
import type { Role } from '../lib/types'
import { Loading } from './kit'

// The homepage (Design 04.5) lives at the site root, outside /app/.
const HOME = '/'

export function Header() {
  const { user } = useSession()
  const account = user?.role === 'clinician' ? '/doctor' : '/account'
  return (
    <header className="app-header on-navy">
      <div className="app-header-inner">
        <a href={HOME} className="brand" aria-label="Carevia home">
          <img src="/app/brand/carevia-mark.png" alt="" width={34} height={34} />
          <span>Carevia</span>
        </a>
        <span className="flex-1" />
        <NavLink to="/doctors" className="nav-pill nav-link">Doctors</NavLink>
        {user?.role === 'patient' && <NavLink to="/appointments" className="nav-pill nav-link hidden sm:inline-flex">Appointments</NavLink>}
        {user
          ? <Link to={account} className="nav-pill glass">
              <span className="max-[480px]:hidden">{user.role === 'clinician' ? 'Your agenda' : 'Your account'}</span>
              <span className="min-[481px]:hidden">{user.role === 'clinician' ? 'Agenda' : 'Account'}</span>
            </Link>
          : <Link to="/signin" className="nav-pill glass">Sign in</Link>}
      </div>
    </header>
  )
}

export function Footer() {
  const { user } = useSession()
  const clinician = user?.role === 'clinician'
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
            <li><a href={HOME} className="inline-flex min-h-11 items-center">Homepage</a></li>
            {clinician ? <li><Link to="/doctor" className="inline-flex min-h-11 items-center">Your agenda</Link></li> : <>
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

function DemoBar() {
  const demo = useDemo()
  // A demo build shows the notice while /api/demo is answering (undefined), so the page doesn't jump down when it
  // arrives (CLS). It is a disclaimer only: demo logins and the outbox link still wait for the API's yes.
  if (!MOCK && !(DEMO_BUILD && demo !== null)) return null
  return (
    <aside className="demo-bar" aria-label="Demo notice">
      <strong className="font-medium">{content('demo-banner').title.replace(/\.$/, '')}.</strong>{' '}
      {plain(content('demo-banner').body)}{MOCK && ' Mock API: data lives in this tab only.'}
      {demo && <> <Link to="/dev/outbox" className="link ml-1">Outbox</Link></>}
    </aside>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <DemoBar />
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
        <Link to={user.role === 'clinician' ? '/doctor' : '/account'} className="btn btn-primary mt-6">Go to your {user.role === 'clinician' ? 'agenda' : 'account'}</Link>
      </div>
    )
  }
  return <>{children}</>
}

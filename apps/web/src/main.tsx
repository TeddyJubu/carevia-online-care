import { StrictMode } from 'react'
import { EmptyArt } from './ui/empty-art'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider, useLocation, useSearchParams } from 'react-router'
import type { ComponentType, ReactNode } from 'react'
import { ADMIN_HOME, homeFor, SessionProvider, useSession } from './lib/session'
import { Loading, PageTitle } from './ui/kit'
import { HomeButton, Layout, RequireRole } from './ui/shell'
import './styles.css'
// The homepage's orange hover rim, one module for the site, this app and admin.
import { rim } from '../../../src/scripts/specular-rim.js'

rim('.btn, .nav-pill, .chip')

function Index() {
  const { user, loading } = useSession()
  if (loading) return <div className="page-narrow"><Loading /></div>
  if (user?.role === 'admin') { window.location.replace(ADMIN_HOME); return null }
  return <Navigate to={user ? homeFor(user) : '/book'} replace />
}

function NotFound() {
  return (
    <div className="page-narrow">
      <EmptyArt scene="not-found" />
      <PageTitle lede="The link may be old, or the page has moved.">We couldn’t find that page</PageTitle>
      <div className="mt-8 flex flex-wrap gap-3">
        <HomeButton />
        <a href="/?site" className="btn btn-secondary">Carevia homepage</a>
      </div>
    </div>
  )
}

/** Old booking links (the homepage, emails, bookmarks): ?service=<area slug> opens that area's doctors and
 * &doctor=<id> that doctor's times. Without them, the booking home itself. */
function LegacyBook({ children }: { children: ReactNode }) {
  const [params] = useSearchParams()
  const group = params.get('service'), doctor = params.get('doctor')
  if (doctor && /^\d+$/.test(doctor)) return <Navigate to={`/book/doctors/${doctor}/times`} replace />
  if (group) return <Navigate to={`/book/doctors?group=${encodeURIComponent(group)}`} replace />
  return children
}

/** The page was briefly at /services-v2: same path under /book. */
function FromServicesV2() {
  const { pathname, search } = useLocation()
  return <Navigate to={pathname.replace(/^\/services-v2/, '/book') + search} replace />
}

const patient = (el: ReactNode) => <RequireRole role="patient">{el}</RequireRole>
const clinician = (el: ReactNode) => <RequireRole role="clinician">{el}</RequireRole>

// Route-level code splitting: each page file is its own chunk, so /app/signin doesn't download the booking, visit
// and doctor screens. The router loads a chunk before it commits the navigation, so the current screen stays up.
type Mod = Record<string, ComponentType>
const files = {
  account: () => import('./pages/account'), appointments: () => import('./pages/appointments'), auth: () => import('./pages/auth'), book: () => import('./pages/book'),
  call: () => import('./pages/call'), dev: () => import('./pages/dev'), doctors: () => import('./pages/doctors'), doctor: () => import('./pages/doctor'),
  visit: () => import('./pages/visit'), waiting: () => import('./pages/waiting'),
}
// A deploy replaces the hashed page chunks, so a tab opened before it can ask for a file that is gone.
// Reload once to pick up the new build; a second failure within a minute is a real error and is shown.
const reloadForNewBuild = (error: unknown): Promise<never> => {
  const last = Number(sessionStorage.getItem('carevia-chunk-reload')) || 0
  if (Date.now() - last < 60_000) throw error
  sessionStorage.setItem('carevia-chunk-reload', String(Date.now()))
  window.location.reload()
  return new Promise<never>(() => {})
}

const page = (file: keyof typeof files, name: string, wrap = (el: ReactNode) => el) => ({
  lazy: async () => {
    const C = ((await files[file]().catch(reloadForNewBuild)) as unknown as Mod)[name]
    return { element: wrap(<C />) }
  },
})

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      HydrateFallback: () => null,
      children: [
        { index: true, element: <Index /> },
        // Signed-in patients keep the account rail here too; the call stays full width.
        {
          ...page('account', 'PatientRail'),
          children: [
            // Booking: services > doctors > profile > times > checkout (pages/book.tsx).
            { path: 'book', ...page('book', 'ServicesHome', (el) => <LegacyBook>{el}</LegacyBook>) },
            { path: 'book/doctors', ...page('book', 'ServicesDoctors') },
            { path: 'book/doctors/:id', ...page('book', 'ServicesDoctor') },
            { path: 'book/doctors/:id/times', ...page('book', 'ServicesTimes') },
            { path: 'book/checkout', ...page('book', 'ServicesCheckout') },
            // The old step-by-step flow's screens (who, time, account, family, consent, pay) start again at /book.
            { path: 'book/*', element: <Navigate to="/book" replace /> },
            { path: 'services-v2/*', element: <FromServicesV2 /> },
            // Public list of every doctor (pages/doctors.tsx); Book opens that doctor's times.
            { path: 'doctors', ...page('doctors', 'DoctorsPage') },
            { path: 'visits/:id', ...page('visit', 'Prepare', patient) },
            { path: 'visits/:id/join', ...page('visit', 'PreJoin', patient) },
            { path: 'visits/:id/reschedule', ...page('visit', 'Reschedule', patient) },
            { path: 'visits/:id/waiting', ...page('waiting', 'Waiting', patient) },
            { path: 'visits/:id/done', ...page('visit', 'Done', patient) },
            { path: 'visits/:id/receipt', ...page('visit', 'Receipt', patient) },
          ],
        },
        { path: 'visits/:id/call', ...page('call', 'CallPage', patient) },
        // Every visit on the account (pages/appointments.tsx), inside the account menu.
        {
          path: 'appointments',
          ...page('account', 'AccountLayout', patient),
          children: [{ index: true, ...page('appointments', 'AppointmentsPage') }],
        },
        {
          path: 'account',
          ...page('account', 'AccountLayout', patient),
          children: [
            { index: true, ...page('account', 'AccountHome') },
            { path: 'family', ...page('account', 'FamilyPage') },
            { path: 'profile', ...page('account', 'ProfilePage') },
            { path: 'security', ...page('account', 'SecurityPage') },
            { path: 'payments', ...page('account', 'PaymentsPage') },
          ],
        },
        { path: 'signin', ...page('auth', 'SignIn') },
        { path: 'signup', ...page('auth', 'SignUp') },
        { path: 'forgot-password', ...page('auth', 'ForgotPassword') },
        { path: 'reset-password', ...page('auth', 'ResetPassword') },
        { path: 'doctor', ...page('doctor', 'Agenda', clinician) },
        { path: 'doctor/visits/:id', ...page('doctor', 'DoctorVisit', clinician) },
        // Demo or development only: the page itself checks both locks.
        { path: 'dev/outbox', ...page('dev', 'Outbox') },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: '/app' },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
)

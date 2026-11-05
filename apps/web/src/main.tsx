import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router'
import { AccountHome, AccountLayout, FamilyPage, ProfilePage, SecurityPage } from './pages/account'
import { ForgotPassword, ResetPassword, SignIn, SignUp } from './pages/auth'
import { BookAccount, BookConsent, BookFamily, BookingLayout, BookPay, BookService, BookTime, BookWho } from './pages/book'
import { CallPage } from './pages/call'
import { Outbox } from './pages/dev'
import { Agenda, DoctorVisit } from './pages/doctor'
import { Done, Prepare, PreJoin, Reschedule } from './pages/visit'
import { Waiting } from './pages/waiting'
import { homeFor, SessionProvider, useSession } from './lib/session'
import { Loading, PageTitle } from './ui/kit'
import { Layout, RequireRole } from './ui/shell'
import './styles.css'

function Index() {
  const { user, loading } = useSession()
  if (loading) return <div className="page-narrow"><Loading /></div>
  return <Navigate to={user ? homeFor(user) : '/book'} replace />
}

function NotFound() {
  return (
    <div className="page-narrow">
      <PageTitle lede="The link may be old, or the page has moved.">We couldn’t find that page</PageTitle>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/account" className="btn btn-primary">Go to your account</Link>
        <a href="/" className="btn btn-secondary">Carevia homepage</a>
      </div>
    </div>
  )
}

const patient = (el: React.ReactNode) => <RequireRole role="patient">{el}</RequireRole>

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { index: true, element: <Index /> },
        {
          path: 'book',
          element: <BookingLayout />,
          children: [
            { index: true, element: <BookService /> },
            { path: 'who', element: <BookWho /> },
            { path: 'time', element: <BookTime /> },
            { path: 'account', element: <BookAccount /> },
            { path: 'family', element: patient(<BookFamily />) },
            { path: 'consent', element: patient(<BookConsent />) },
            { path: 'pay', element: patient(<BookPay />) },
          ],
        },
        { path: 'visits/:id', element: patient(<Prepare />) },
        { path: 'visits/:id/join', element: patient(<PreJoin />) },
        { path: 'visits/:id/reschedule', element: patient(<Reschedule />) },
        { path: 'visits/:id/waiting', element: patient(<Waiting />) },
        { path: 'visits/:id/call', element: patient(<CallPage />) },
        { path: 'visits/:id/done', element: patient(<Done />) },
        {
          path: 'account',
          element: patient(<AccountLayout />),
          children: [
            { index: true, element: <AccountHome /> },
            { path: 'family', element: <FamilyPage /> },
            { path: 'profile', element: <ProfilePage /> },
            { path: 'security', element: <SecurityPage /> },
          ],
        },
        { path: 'signin', element: <SignIn /> },
        { path: 'signup', element: <SignUp /> },
        { path: 'forgot-password', element: <ForgotPassword /> },
        { path: 'reset-password', element: <ResetPassword /> },
        { path: 'doctor', element: <RequireRole role="clinician"><Agenda /></RequireRole> },
        { path: 'doctor/visits/:id', element: <RequireRole role="clinician"><DoctorVisit /></RequireRole> },
        // Demo or development only: the page itself checks both locks.
        { path: 'dev/outbox', element: <Outbox /> },
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

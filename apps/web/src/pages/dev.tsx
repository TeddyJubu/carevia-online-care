import { Link } from 'react-router'
import { api } from '../lib/api'
import { DEMO_BUILD, useDemo } from '../lib/demo'
import { useLoad } from '../lib/load'
import { fullDate, hhmm } from '../lib/time'
import { Empty, ErrorState, Loading, PageTitle } from '../ui/kit'

// Emails the API would have sent. Only in a demo build with demo mode on the API, or in development.
export function Outbox() {
  const demo = useDemo()
  const allowed = (DEMO_BUILD && !!demo) || import.meta.env.DEV
  if (!allowed) {
    return (
      <div className="page-narrow">
        <PageTitle lede="The link may be old, or the page has moved.">We couldn’t find that page</PageTitle>
        <Link to="/account" className="btn btn-primary mt-8">Go to your account</Link>
      </div>
    )
  }
  return <OutboxList />
}

function MailLink({ href }: { href: string }) {
  // Links inside the app become router links; anything else opens as a normal link.
  if (href.startsWith('/app/') || href === '/app') {
    const to = href.slice(4) || '/'
    return <Link to={to} className="link break-all inline-flex min-h-11 items-center">{href}</Link>
  }
  if (href.startsWith('/')) return <a href={href} className="link break-all inline-flex min-h-11 items-center">{href}</a>
  return <a href={href} rel="noopener noreferrer" target="_blank" className="link break-all inline-flex min-h-11 items-center">{href}</a>
}

function OutboxList() {
  const box = useLoad(() => api.outbox(), [])
  const messages = box.data ? [...box.data.messages].sort((a, b) => b.sentAt.localeCompare(a.sentAt)) : []
  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle eyebrow="Demo" title="Outbox" lede="Emails that would have been sent. Nothing leaves this computer.">Outbox</PageTitle>
        <button type="button" className="btn btn-secondary" onClick={box.reload} disabled={box.loading}>{box.loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="mt-8 max-w-[760px]">
        {box.loading && !box.data ? <Loading label="Loading the outbox" lines={3} />
          : box.error ? <ErrorState error={box.error} onRetry={box.reload} title="We couldn’t load the outbox" />
          : messages.length === 0 ? <Empty title="No emails yet">Sign up, book a visit or ask for a password reset, then refresh.</Empty>
          : (
            <ol className="grid gap-4" aria-label="Emails, newest first">
              {messages.map((m) => (
                <li key={m.id} className="card">
                  <article aria-labelledby={`mail-${m.id}`}>
                    <p className="fine">
                      To {m.to} · <time dateTime={m.sentAt}>{fullDate(m.sentAt)}, {hhmm(m.sentAt)}</time>
                    </p>
                    <h2 id={`mail-${m.id}`} className="mt-2 text-[22px]">{m.subject}</h2>
                    <p className="mt-3 whitespace-pre-line">{m.text}</p>
                    {m.links.length > 0 && (
                      <ul className="mt-3 grid">
                        {m.links.map((l) => <li key={l}><MailLink href={l} /></li>)}
                      </ul>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          )}
      </div>
    </div>
  )
}

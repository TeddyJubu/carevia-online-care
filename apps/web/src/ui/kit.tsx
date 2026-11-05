import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from 'react'
import type { ApiError } from '../lib/api'
import { useNow } from '../lib/load'
import { countdown } from '../lib/time'

/** Sets the tab title and moves focus to the page heading after navigation, so screen readers hear the new page. */
export function PageTitle({ children, title, eyebrow, lede, className = '' }: { children: ReactNode; title?: string; eyebrow?: ReactNode; lede?: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    document.title = `${title ?? (typeof children === 'string' ? children : 'Carevia')} · Carevia`
    ref.current?.focus({ preventScroll: true })
  }, [title, children])
  return (
    <div className={className}>
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h1 ref={ref} tabIndex={-1} className="outline-none">{children}</h1>
      {lede && <p className="lede mt-4">{lede}</p>}
    </div>
  )
}

type FieldProps = { label: ReactNode; hint?: ReactNode; error?: string | null; className?: string }

/** Label, hint and error tied to the control with aria-describedby; the error is announced. */
export function Field({ label, hint, error, className = '', as = 'input', children, ...rest }: FieldProps &
  ({ as?: 'input' } & ComponentProps<'input'> | { as: 'select'; children: ReactNode } & ComponentProps<'select'> | { as: 'textarea' } & ComponentProps<'textarea'>)) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const common = { id, className: 'input', 'aria-invalid': error ? true : undefined, 'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined }
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id} className="field-label">{label}</label>
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      {as === 'select' ? <select {...common} {...(rest as ComponentProps<'select'>)}>{children}</select>
        : as === 'textarea' ? <textarea {...common} {...(rest as ComponentProps<'textarea'>)} />
        : <input {...common} {...(rest as ComponentProps<'input'>)} />}
      <p id={errId} className="field-error" aria-live="polite">{error ? <><Dot />{error}</> : null}</p>
    </div>
  )
}

const Dot = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="flex-none translate-y-[1px]"><circle cx="6" cy="6" r="5" fill="currentColor" /><path d="M6 3.2v3.4M6 8.4v.1" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>

/** A form-level error, announced when it appears. */
export function FormError({ error }: { error?: string | null }) {
  return <div role="alert" aria-live="assertive">{error ? <p className="notice notice-danger">{error}</p> : null}</div>
}

export function Emergency({ compact }: { compact?: boolean }) {
  return (
    <aside className="emergency" aria-label="Emergencies">
      <span>{compact ? 'Not an emergency service.' : <><strong className="font-medium">Is this an emergency?</strong> Carevia is not an emergency service.</>}</span>
      <span>In an emergency, <a href="tel:112">call 112</a>.</span>
    </aside>
  )
}

export function Notice({ tone = 'info', children, className = '' }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode; className?: string }) {
  return <div className={`notice ${tone === 'info' ? '' : `notice-${tone}`} ${className}`}>{children}</div>
}

export function Loading({ label = 'Loading', lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton h-16" style={{ opacity: 1 - i * 0.2 }} aria-hidden="true" />)}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return <span role="status" className="inline-flex items-center gap-3 muted"><span className="spinner" aria-hidden="true" />{label}</span>
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card text-center py-10 px-6">
      <h3>{title}</h3>
      {children && <p className="muted mt-2 max-w-[44ch] mx-auto">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'We couldn’t load this' }: { error: ApiError | { message: string }; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="card border-[#b3261e33]">
      <h3>{title}</h3>
      <p className="muted mt-2">{error.message}</p>
      {onRetry && <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={onRetry}>Try again</button>}
    </div>
  )
}

/** Native <dialog>: focus trap, Escape and the backdrop come from the browser. */
export function Dialog({ open, onClose, title, children, labelledBy }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={labelledBy ?? id} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="flex items-start justify-between gap-4">
        <h2 id={id} className="text-[26px]">{title}</h2>
        <button type="button" onClick={onClose} className="btn btn-quiet btn-sm -mr-3 -mt-2 min-w-11" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </div>
      <div className="mt-4">{open && children}</div>
    </dialog>
  )
}

export function HoldTimer({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
  const now = useNow()
  const left = countdown(expiresAt, now)
  const fired = useRef(false)
  useEffect(() => {
    if (!left && !fired.current) { fired.current = true; onExpire?.() }
  }, [left, onExpire])
  const low = !!left && new Date(expiresAt).getTime() - now < 120000
  return (
    <span className={`badge ${low ? 'badge-warn' : ''} hold`}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M8 4.5V8l2.5 1.5" /></svg>
      {left ? <span><span className="sr-only">Time held for you: </span>{left}</span> : 'Time released'}
    </span>
  )
}

/** Very small Markdown for the content files: ## headings, paragraphs, - lists and **bold**. */
export function Markdown({ source, headingLevel = 3 }: { source: string; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h2' : 'h3'
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <strong key={i} className="font-medium">{p.slice(2, -2)}</strong> : p))
  return (
    <div className="prose">
      {source.trim().split(/\n\s*\n/).map((block, i) => {
        const b = block.trim()
        if (/^#{1,6}\s/.test(b)) return <H key={i}>{inline(b.replace(/^#+\s*/, ''))}</H>
        if (/^[-*]\s/.test(b)) return <ul key={i}>{b.split('\n').map((l, j) => <li key={j}>{inline(l.replace(/^[-*]\s*/, ''))}</li>)}</ul>
        return <p key={i}>{inline(b.replace(/\n/g, ' '))}</p>
      })}
    </div>
  )
}

export function DoctorAvatar({ doctor, size = 52 }: { doctor: { id: number; initials: string; name: string }; size?: number }) {
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.32 }} aria-hidden="true">{doctor.initials}</span>
}

export const euro = (n: number) => `€${n}`

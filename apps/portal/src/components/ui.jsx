import { useEffect } from 'react';

export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Carevia` : 'Carevia';
  }, [title]);
}

export function Steps({ current }) {
  const items = ['Service & doctor', 'Date & time', 'Your account', 'Review & confirm'];
  return (
    <div className="bc-steps" aria-label="Booking steps">
      {items.map((item, index) => (
        <span key={item} className={index === current ? 'bc-current' : undefined}>
          {index + 1}. {item}
        </span>
      ))}
    </div>
  );
}

export function Banner({ children, tone = 'info' }) {
  return (
    <div className={tone === 'error' ? 'bc-banner bc-banner-error' : 'bc-banner'} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bc-svg">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16.5 20 20.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ServiceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bc-svg">
      <rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

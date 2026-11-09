// Lucide icons (ISC licence), inlined: the app uses a dozen, not worth a dependency.
const PATHS: Record<string, string> = {
  'mouse-pointer-click': '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
  stethoscope: '<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
  brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  microscope: '<path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>',
  'file-check': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  'test-tube-diagonal': '<path d="M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3"/><path d="m16 2 6 6"/><path d="M12 16H4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'circle-chevron-down': '<circle cx="12" cy="12" r="10"/><path d="m16 10-4 4-4-4"/>',
  'chart-column': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
}

// Duotone layer for the care-area icons: a soft fill under the strokes (the pill's half, the tube's liquid, the brain's lobes).
const FILLS: Record<string, string> = {
  stethoscope: '<path d="M2 5h12v4a6 6 0 0 1-12 0Z"/><circle cx="20" cy="10" r="3"/>',
  brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>',
  microscope: '<path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M3 22h18v-1H3Z"/>',
  'file-check': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>',
  pill: '<path d="M8.5 8.5 13.5 3.5A4.95 4.95 0 0 1 20.5 10.5L15.5 15.5Z"/>',
  'test-tube-diagonal': '<path d="M4 16h8l-5.18 5.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4Z"/>',
}

/** Muted per-area hue: ink colour on a pale tint, close enough to the navy to stay calm. Unknown names get the brand blue. */
export const TONES: Record<string, { fg: string; bg: string }> = {
  stethoscope: { fg: '#0f6b66', bg: '#e2f2ef' },
  brain: { fg: '#5f4aa8', bg: '#eeeaf8' },
  scale: { fg: '#3d7436', bg: '#e9f2e4' },
  microscope: { fg: '#1d5a9e', bg: '#e4eef9' },
  'file-check': { fg: '#9a5a0c', bg: '#f9efdc' },
  pill: { fg: '#a83a5b', bg: '#f9e7ed' },
  'test-tube-diagonal': { fg: '#0b6a82', bg: '#e0f1f6' },
}
const BRAND = { fg: '#1d4f91', bg: '#e6eef8' }

/** Decorative icon; unknown names fall back to the stethoscope. */
export function Icon({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  const fill = FILLS[name] ? `<g fill="currentColor" stroke="none" opacity=".2">${FILLS[name]}</g>` : ''
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: fill + (PATHS[name] ?? PATHS.stethoscope) }} />
  )
}

/** Care-area badge: duotone icon on its own tinted tile. */
export function CareIcon({ name, size = 48 }: { name: string; size?: number }) {
  const t = TONES[name] ?? BRAND
  return (
    <span className="grid shrink-0 place-items-center rounded-xl"
      style={{ width: size, height: size, color: t.fg, background: `linear-gradient(180deg, #fff 0%, ${t.bg} 100%)`, boxShadow: `inset 0 0 0 1px ${t.fg}24, 0 1px 2px ${t.fg}1a` }}>
      <Icon name={name} size={Math.round(size / 2)} />
    </span>
  )
}

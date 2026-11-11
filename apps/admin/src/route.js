const SECTIONS = new Set(['appointments', 'patients', 'doctors', 'services', 'applications', 'daily'])

export function parseRoute(hash = '') {
  const path = (hash || '#/appointments').replace(/^#/, '')
  const [section, id = ''] = path.split('/').filter(Boolean)
  if (!SECTIONS.has(section)) return { section: 'appointments', id: '' }
  return { section, id }
}

const SECTIONS = new Set(['patients', 'doctors', 'services', 'daily'])

export function parseRoute(hash = '') {
  const path = (hash || '#/patients').replace(/^#/, '')
  const [section, id = ''] = path.split('/').filter(Boolean)
  if (!SECTIONS.has(section)) return { section: 'patients', id: '' }
  return { section, id }
}

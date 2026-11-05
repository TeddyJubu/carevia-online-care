import { useEffect, useState } from 'react'
import { api } from './api'
import type { DemoInfo } from './types'

// Demo mode is locked twice: this build flag AND GET /api/demo (which 404s unless DEMO_MODE=true on the API).
// Vite replaces the flag at build time, so a normal build drops every demo branch.
export const DEMO_BUILD = import.meta.env.VITE_DEMO === '1'

let cached: Promise<DemoInfo | null> | null = null
/** The demo info, null when demo mode is off, undefined while the API hasn't answered yet. */
export function useDemo(): DemoInfo | null | undefined {
  const [info, setInfo] = useState<DemoInfo | null | undefined>(undefined)
  useEffect(() => {
    if (!DEMO_BUILD) return
    cached ??= api.demo().then((d) => (d?.enabled ? d : null), () => null)
    cached.then(setInfo)
  }, [])
  return DEMO_BUILD ? info : null
}

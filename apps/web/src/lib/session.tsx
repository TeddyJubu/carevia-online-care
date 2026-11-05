import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import type { User } from './types'

type Ctx = { user: User | null; loading: boolean; refresh: () => Promise<User | null>; signOut: () => Promise<void> }
const SessionContext = createContext<Ctx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const s = await api.auth.session()
      setUser(s?.user ?? null)
      return s?.user ?? null
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])
  const signOut = useCallback(async () => {
    await api.auth.signOut().catch(() => {})
    setUser(null)
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return <SessionContext value={{ user, loading, refresh, signOut }}>{children}</SessionContext>
}

export function useSession() {
  const ctx = use(SessionContext)
  if (!ctx) throw new Error('useSession outside SessionProvider')
  return ctx
}

/** Where a signed-in account lands by default. */
export const homeFor = (u: User) => (u.role === 'clinician' ? '/doctor' : u.role === 'admin' ? '/signin?admin=1' : '/account')

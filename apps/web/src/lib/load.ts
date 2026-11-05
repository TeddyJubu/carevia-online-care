import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

export type Load<T> = { data: T | undefined; error: ApiError | null; loading: boolean; reload: () => void; set: (d: T) => void }

/** Runs a request when deps change; keeps the last data while reloading. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): Load<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)
  useEffect(() => {
    const mine = ++seq.current
    setLoading(true)
    setError(null)
    fn().then(
      (d) => { if (mine === seq.current) { setData(d); setLoading(false) } },
      (e) => { if (mine === seq.current) { setError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', 'Something went wrong. Please try again.')); setLoading(false) } },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload, set: setData }
}

/** Ticks every second, for countdowns. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

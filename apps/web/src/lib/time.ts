// Every time is shown in Lisbon, whatever the device's zone (the contract stores UTC).
export const TZ = 'Europe/Lisbon'

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...o })
const dayKey = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' })
const timeF = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const longDay = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const shortDay = fmt({ weekday: 'short', day: 'numeric', month: 'short' })
const dateOnly = fmt({ day: 'numeric', month: 'short', year: 'numeric' })

/** 'YYYY-MM-DD' of an instant, in Lisbon. */
export function lisbonDay(d: Date | string = new Date()): string {
  const p = Object.fromEntries(dayKey.formatToParts(new Date(d)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Lisbon wall-clock ('2026-11-06', '09:30') to a UTC instant. Correct across the DST switch. */
export function lisbonToUtc(day: string, time: string): Date {
  const guess = new Date(`${day}T${time}:00Z`)
  const p = Object.fromEntries(
    fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(guess).map((x) => [x.type, x.value]),
  )
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return new Date(guess.getTime() - (shown - guess.getTime()))
}

export const hhmm = (iso: string) => timeF.format(new Date(iso))

/** "Today", "Tomorrow" or "Thursday 6 November". */
export function dayLabel(iso: string, now = new Date()): string {
  const d = lisbonDay(iso), t = lisbonDay(now)
  if (d === t) return 'Today'
  if (d === addDays(t, 1)) return 'Tomorrow'
  return longDay.format(new Date(iso))
}

export const when = (iso: string) => `${dayLabel(iso)}, ${hhmm(iso)}`
export const shortDate = (iso: string) => shortDay.format(new Date(iso))
export const fullDate = (iso: string) => dateOnly.format(new Date(iso))
export const minutes = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)

/** A date of birth ('YYYY-MM-DD') shown without a time-zone shift. */
export const birthDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Whole years between a date of birth and today (Lisbon). */
export function age(dateOfBirth: string, today = lisbonDay()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
}

/** "9:42" left until an instant, or null once it has passed. */
export function countdown(iso: string, now = Date.now()): string | null {
  const s = Math.floor((new Date(iso).getTime() - now) / 1000)
  if (s <= 0) return null
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m}:${String(s % 60).padStart(2, '0')}`
}

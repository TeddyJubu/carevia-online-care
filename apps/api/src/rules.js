// Pure rules with no database access, so they can be unit-tested on any date.
// Calendar dates are "YYYY-MM-DD" strings and are compared by their parts.
// Never pass them to new Date("YYYY-MM-DD"): that reads them as UTC midnight and shifts them in other zones.

export const ZONE = 'Europe/Lisbon'

/** "YYYY-MM-DD" to { year, month, day } (month 1-12), or null if it is not a real calendar date. */
export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return { year, month, day }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function compareParts(a, b) {
  return (a.year - b.year) || (a.month - b.month) || (a.day - b.day)
}

/** Today's calendar date in Lisbon, as "YYYY-MM-DD". */
export function lisbonToday(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

/**
 * True if someone born on `dateOfBirth` is 18 or over on `today` (both "YYYY-MM-DD", Lisbon calendar).
 * Leap-day rule: a person born on 29 February turns 18 on 1 March when the 18th year is not a leap year.
 * Invalid or empty input, or a birth date after today, returns false.
 */
export function isAdult(dateOfBirth, today = lisbonToday()) {
  const birth = parseDate(dateOfBirth)
  const now = parseDate(today)
  if (!birth || !now || compareParts(birth, now) > 0) return false
  const year = birth.year + 18
  const birthday = birth.month === 2 && birth.day === 29 && !isLeapYear(year)
    ? { year, month: 3, day: 1 }
    : { year, month: birth.month, day: birth.day }
  return compareParts(now, birthday) >= 0
}

/** True for a real birth date that is not after today and is under 18. */
export function isMinor(dateOfBirth, today = lisbonToday()) {
  const birth = parseDate(dateOfBirth)
  const now = parseDate(today)
  if (!birth || !now || compareParts(birth, now) > 0) return false
  return !isAdult(dateOfBirth, today)
}

/**
 * Normalises a phone number to E.164 ("+351900000000"), or returns null.
 * Spaces, dots, dashes and brackets are allowed in the input and removed. The country code is required.
 */
export function normalizePhone(value) {
  if (typeof value !== 'string') return null
  const compact = value.trim().replace(/[\s.\-()]/g, '')
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null
}

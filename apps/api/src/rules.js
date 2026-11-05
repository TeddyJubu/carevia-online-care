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

// ---- Lisbon wall-clock time ----

const offsetFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** Lisbon's offset from UTC at an instant, in milliseconds (0 in winter, 3 600 000 in summer). */
function lisbonOffset(ms) {
  const p = Object.fromEntries(offsetFormatter.formatToParts(new Date(ms)).map((part) => [part.type, Number(part.value)]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

/**
 * The UTC instant of a Lisbon wall-clock time. `date` is "YYYY-MM-DD", `time` is "HH:MM".
 * A time skipped by the spring change (01:00–01:59 on the last Sunday of March) moves forward an hour;
 * a time that happens twice in October resolves to the second (winter) occurrence. Slot times never fall there.
 */
export function lisbonTimeToUtc(date, time) {
  const d = parseDate(date)
  const [hours, minutes] = String(time).split(':').map(Number)
  if (!d || !Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  const asUtc = Date.UTC(d.year, d.month - 1, d.day, hours, minutes)
  let instant = asUtc - lisbonOffset(asUtc)
  const second = lisbonOffset(instant)
  if (second !== lisbonOffset(asUtc)) instant = asUtc - second
  return new Date(instant)
}

/** "YYYY-MM-DD" plus n calendar days. */
export function addDays(date, days) {
  const d = parseDate(date)
  return new Date(Date.UTC(d.year, d.month - 1, d.day + days)).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
function weekday(date) {
  const d = parseDate(date)
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()
}

/** Start (inclusive) and end (exclusive) instants of a Lisbon calendar day. */
export function lisbonDayRange(date) {
  return { from: lisbonTimeToUtc(date, '00:00'), to: lisbonTimeToUtc(addDays(date, 1), '00:00') }
}

// ---- Rolling schedule ----

export const SCHEDULE_DAYS = 21
export const SLOT_MINUTES = 30
// Lisbon wall-clock start times on each working day (Monday to Friday).
export const SLOT_TIMES = ['09:00', '10:30', '12:00', '14:30', '16:00', '17:30', '19:00']

/**
 * Slots for one doctor over the 21 calendar days starting `today` (Lisbon date).
 * `availabilityIndex` keeps the demo's variety: the doctor's first working days are skipped,
 * so 0 is free from today, 1 from the next working day, 2 from the one after.
 */
export function scheduleFor(availabilityIndex, today) {
  const slots = []
  let workingDay = 0
  for (let i = 0; i < SCHEDULE_DAYS; i += 1) {
    const date = addDays(today, i)
    const day = weekday(date)
    if (day === 0 || day === 6) continue
    workingDay += 1
    if (workingDay <= availabilityIndex) continue
    for (const time of SLOT_TIMES) {
      const startsAt = lisbonTimeToUtc(date, time)
      slots.push({ startsAt, endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60_000) })
    }
  }
  return slots
}

// ---- Holds and the join window ----

export const HOLD_MINUTES = 10
export const JOIN_OPENS_MINUTES_BEFORE = 10
export const JOIN_CLOSES_MINUTES_AFTER = 60

export function holdExpiry(now = new Date()) {
  return new Date(now.getTime() + HOLD_MINUTES * 60_000)
}

/** A held appointment whose hold has run out is expired, even before the sweep writes that down. */
export function effectiveStatus(appointment, now = new Date()) {
  if (appointment.status === 'held' && (!appointment.holdExpiresAt || appointment.holdExpiresAt <= now)) return 'expired'
  return appointment.status
}

export function joinWindow(appointment) {
  return {
    joinOpensAt: new Date(appointment.startsAt.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60_000),
    joinClosesAt: new Date(appointment.endsAt.getTime() + JOIN_CLOSES_MINUTES_AFTER * 60_000),
  }
}

/** "too_early", "open" or "closed". */
export function joinState(appointment, now = new Date()) {
  const { joinOpensAt, joinClosesAt } = joinWindow(appointment)
  if (now < joinOpensAt) return 'too_early'
  if (now > joinClosesAt) return 'closed'
  return 'open'
}

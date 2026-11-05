// Daily rooms use a random name from Daily. Do not send a patient name, email, or phone.

const MONTHS = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
}

export class DailyError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'DailyError'
    this.status = status
  }
}

async function dailyRequest(apiKey, path, body) {
  let response
  try {
    response = await fetch(`https://api.daily.co/v1${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new DailyError('Daily could not be reached')
  }

  if (!response.ok) {
    throw new DailyError(`Daily responded with ${response.status}`, response.status)
  }

  try {
    return await response.json()
  } catch {
    throw new DailyError('Daily returned an unreadable response', response.status)
  }
}

export function createPrivateRoom(apiKey) {
  return dailyRequest(apiKey, '/rooms', {
    privacy: 'private',
    properties: {
      enable_recording: false,
    },
  })
}

export function createMeetingToken(apiKey, { roomName, isOwner, nbf, exp }) {
  return dailyRequest(apiKey, '/meeting-tokens', {
    properties: {
      room_name: roomName,
      is_owner: isOwner,
      nbf,
      exp,
      eject_at_token_exp: true,
    },
  })
}

function lisbonUnix(day, time) {
  const [dateText, monthName, yearText] = day.split(' ')
  const month = MONTHS[monthName]
  const year = Number(yearText)
  const date = Number(dateText)
  const [hours, minutes] = time.split(':').map(Number)
  if (month == null || [year, date, hours, minutes].some((value) => Number.isNaN(value))) return null

  const guess = Date.UTC(year, month, date, hours, minutes)
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]))
  const formatted = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  )
  return Math.floor((guess - (formatted - guess)) / 1000)
}

export function tokenWindow(slotLabel) {
  const now = Math.floor(Date.now() / 1000)
  const fallback = { nbf: now - 5 * 60, exp: now + 2 * 60 * 60 }
  const [day, time] = slotLabel.split(' \u00b7 ')
  if (!day || !time) return fallback
  const slot = lisbonUnix(day, time)
  if (slot == null) return fallback
  const exp = slot + 2 * 60 * 60
  if (exp < now + 60) return fallback
  return { nbf: slot - 10 * 60, exp }
}

export function dailyHint(apiKey) {
  const key = apiKey ?? ''
  return {
    enabled: key.length > 0,
    hint: key.length > 4 ? key.slice(-4) : '',
  }
}

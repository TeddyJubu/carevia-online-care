// Daily rooms use a random name from Daily. Never send a patient's name, email, phone or reason.
// DAILY_API_URL exists so the smoke test can point the API at a local fake Daily.
const DAILY_API_URL = (process.env.DAILY_API_URL || 'https://api.daily.co/v1').replace(/\/$/, '')

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
    response = await fetch(`${DAILY_API_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new DailyError('Daily could not be reached')
  }
  if (!response.ok) throw new DailyError(`Daily responded with ${response.status}`, response.status)
  try {
    return await response.json()
  } catch {
    throw new DailyError('Daily returned an unreadable response', response.status)
  }
}

const unix = (date) => Math.floor(date.getTime() / 1000)

/** One private room per confirmed appointment. It expires, and ejects everyone, when the join window closes. */
export function createPrivateRoom(apiKey, { closesAt }) {
  return dailyRequest(apiKey, '/rooms', {
    privacy: 'private',
    // Recording stays off: enable_recording is left unset (Daily's default is no recording).
    properties: {
      exp: unix(closesAt),
      eject_at_room_exp: true,
    },
  })
}

/** A short-lived token, valid only inside the join window. `userName` is a role label, never patient details. */
export function createMeetingToken(apiKey, { roomName, isOwner, userName, opensAt, closesAt }) {
  return dailyRequest(apiKey, '/meeting-tokens', {
    properties: {
      room_name: roomName,
      is_owner: isOwner,
      user_name: userName,
      nbf: unix(opensAt),
      exp: unix(closesAt),
      eject_at_token_exp: true,
    },
  })
}

export function dailyHint(apiKey) {
  const key = apiKey ?? ''
  return {
    enabled: key.length > 0,
    hint: key.length > 4 ? key.slice(-4) : '',
  }
}

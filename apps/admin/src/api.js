// Same origin: Vite proxies /api to the API, so Better Auth's cookie is first-party.
const API_ORIGIN = ''

export class ApiError extends Error {
  constructor(message, { status, code, unreachable = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.unreachable = unreachable
  }
}

function fallbackMessage(status) {
  if (status === 401) return 'Email or password is not recognized.'
  if (status === 403) return 'This account is not an admin.'
  return `The request failed (${status}).`
}

export async function request(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('The API did not respond.', { unreachable: true })
  }

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const code = typeof data?.error === 'string' ? data.error : ''
    const message =
      typeof data?.message === 'string' && data.message
        ? data.message
        : fallbackMessage(response.status)
    throw new ApiError(message, { status: response.status, code })
  }

  return data
}

function asUserRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function readUser(data) {
  if (!asUserRecord(data)) return null
  const nested = [data.user, data.account, data.session, data.admin].find(
    (item) => asUserRecord(item) && (item.email || item.role || item.id),
  )
  const source = nested || data

  const rawRole = source.role || source.accountRole || ''
  const role = String(rawRole).toLowerCase()
  const isAdmin =
    role === 'admin' ||
    source.isAdmin === true ||
    source.admin === true ||
    (Array.isArray(source.roles) && source.roles.some((item) => String(item).toLowerCase() === 'admin'))

  const email = typeof source.email === 'string' ? source.email : ''
  const name = [source.firstName, source.lastName].filter((part) => typeof part === 'string' && part).join(' ')

  if (!email && !role && !isAdmin && !name) return null

  return {
    email,
    name,
    role: isAdmin ? 'admin' : role,
  }
}

export async function getSession() {
  try {
    const data = await request('/api/auth/get-session')
    const user = readUser(data)
    if (!user) return { user: null, forbidden: false, unreachable: false }
    return {
      user,
      forbidden: user.role !== 'admin',
      unreachable: false,
    }
  } catch (error) {
    if (error.status === 401) {
      return { user: null, forbidden: false, unreachable: false }
    }
    if (error.status === 403) {
      return { user: readUser(null), forbidden: true, unreachable: false }
    }
    throw error
  }
}

/** Two-factor code after a sign-in that returned { twoFactorRedirect: true }, or to finish turning it on. */
export function verifyTotp(code) {
  return request('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code } })
}

/** Starts two-factor setup. Returns { totpURI, backupCodes }; it is on once a code is verified. */
export function enableTwoFactor(password) {
  return request('/api/auth/two-factor/enable', { method: 'POST', body: { password } })
}

/** Demo logins are shown only when this build has demo mode on AND the API says demo mode is on. */
export async function getDemoAdmin() {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null
  try {
    const data = await request('/api/demo')
    return data?.accounts?.find((account) => account.role === 'admin') || null
  } catch {
    return null
  }
}

export function getAppointments({ date, status }) {
  const query = new URLSearchParams()
  if (date) query.set('date', date)
  if (status) query.set('status', status)
  return request(`/api/admin/appointments?${query}`)
}

export function login(email, password) {
  return request('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email, password },
  })
}

export function logout() {
  return request('/api/auth/sign-out', { method: 'POST', body: {} })
}

export function readDaily(data) {
  const hint = typeof data?.hint === 'string' ? data.hint.trim() : ''
  return {
    enabled: Boolean(data?.enabled),
    hint: hint ? hint.slice(-4) : '',
  }
}

export function getDaily() {
  return request('/api/admin/daily').then(readDaily)
}

export function saveDailyKey(apiKey) {
  return request('/api/admin/daily', {
    method: 'PUT',
    body: { apiKey },
  })
}

export function redact(message, secret) {
  if (!message) return 'The request failed.'
  if (!secret) return message
  return message.split(secret).join('the key')
}

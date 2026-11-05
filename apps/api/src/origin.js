// CSRF guard for every /api route that changes data. Better Auth already checks origins on /api/auth/*.
// SameSite=Lax is not enough: sibling *.triplelabs.dev subdomains count as the same site, so their
// cookie-carrying POSTs would reach us. The Origin header tells the real sender apart.
const CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Returns why a request must be refused, or null when it may go on.
 * - Origin present: it must be one of `trusted`.
 * - Origin missing: Sec-Fetch-Site must be "same-origin".
 * - Both missing (curl, scripts): allowed only outside production.
 */
export function originProblem({ method, path, origin, secFetchSite, production, trusted }) {
  if (!CHANGING.has(method)) return null
  if (!path.startsWith('/api/') || path.startsWith('/api/auth/')) return null
  if (origin) return trusted.includes(origin) ? null : 'untrusted origin'
  if (secFetchSite) return secFetchSite === 'same-origin' ? null : 'cross-site request'
  return production ? 'no origin' : null
}

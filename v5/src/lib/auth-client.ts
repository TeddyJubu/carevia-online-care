import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// Same origin as the site (the auth server runs inside Vite), so no baseURL is needed.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { dateOfBirth: { type: 'string' } } })],
})

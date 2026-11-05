import './env.js'

// Demo mode is off unless DEMO_MODE is exactly "true".
export const DEMO_MODE = process.env.DEMO_MODE === 'true'
// The outbox (emails stored instead of sent) exists only in demo mode or development.
export const OUTBOX_ENABLED = DEMO_MODE || process.env.NODE_ENV === 'development'
export const IMED_URL = process.env.IMED_URL || 'https://imed.pt/imed/home'

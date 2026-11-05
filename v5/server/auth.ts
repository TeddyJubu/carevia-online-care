import { DatabaseSync } from 'node:sqlite'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { APIError } from 'better-auth/api'
import { getMigrations } from 'better-auth/db/migration'
import { isAdult } from '../src/lib/age.ts'

// ponytail: the demo secret and URL live in v5/.env (gitignored). Use a real secret manager before launch.
try {
  process.loadEnvFile('.env')
} catch {}

const options = {
  // ponytail: Node's built-in SQLite, one local file. Swap for Postgres in an EU region before real patients sign up.
  database: new DatabaseSync('carevia-demo.db'),
  emailAndPassword: { enabled: true },
  user: { additionalFields: { dateOfBirth: { type: 'string', required: true } } },
  databaseHooks: {
    user: {
      create: {
        // The age rule is enforced here, on the server. The form checks it too, but only for a faster message.
        before: async (user) => {
          if (!isAdult(String(user.dateOfBirth))) {
            throw new APIError('BAD_REQUEST', {
              message: 'You need to be 18 or over to create an account. A parent or guardian can book for a child.',
            })
          }
        },
      },
    },
  },
} satisfies BetterAuthOptions

// Create or update the tables before Better Auth starts, so its startup schema check passes on a fresh database.
await (await getMigrations(options)).runMigrations()

export const auth = betterAuth(options)

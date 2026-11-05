// Loads apps/api/.env once. Import this first wherever process.env is read at module load
// (ES modules run their imports before their own code, so config.js must not read env before this).
// Values already set in the shell win over the file.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'), quiet: true })

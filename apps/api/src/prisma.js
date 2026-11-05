import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(apiRoot, '.env'), quiet: true })

export const prisma = new PrismaClient()

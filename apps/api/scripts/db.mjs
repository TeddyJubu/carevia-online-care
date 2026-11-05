import '../src/env.js'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databaseDir = path.join(apiRoot, 'data', 'pg')
const port = Number(process.env.PGPORT) || 5432

function portOpen(targetPort) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: targetPort, host: '127.0.0.1' })
    const finish = (open) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(400, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

async function ensureDatabase() {
  const admin = new pg.Client({
    user: 'carevia',
    password: 'carevia',
    host: '127.0.0.1',
    port,
    database: 'postgres',
  })
  await admin.connect()
  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', ['carevia'])
  if (existing.rowCount === 0) {
    await admin.query('CREATE DATABASE carevia')
    console.log('Created database carevia')
  } else {
    console.log('Database carevia already exists')
  }
  await admin.end()
}

async function main() {
  if (await portOpen(port)) {
    await ensureDatabase()
    console.log(`Postgres is already listening on 127.0.0.1:${port}. Leave that process running.`)
    return
  }

  fs.mkdirSync(path.join(apiRoot, 'data'), { recursive: true })
  const logPath = path.join(apiRoot, 'data', 'postgres.log')
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: 'carevia',
    password: 'carevia',
    port,
    persistent: true,
    autoRehydrateSymlinks: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: (message) => {
      fs.appendFileSync(logPath, String(message))
    },
    onError: (message) => {
      const text = String(message).trim()
      if (text) console.error(`[postgres] ${text}`)
    },
  })

  if (!fs.existsSync(path.join(databaseDir, 'PG_VERSION'))) {
    console.log(`Initialising Postgres data in ${databaseDir}`)
    await postgres.initialise()
  }

  await postgres.start()
  await ensureDatabase()
  console.log(`Embedded Postgres is listening on 127.0.0.1:${port} (database carevia). Leave this process running.`)
  await new Promise(() => {})
}

await main()

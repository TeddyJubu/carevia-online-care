import { buildApp } from './app.js'
import { prisma } from './prisma.js'

const port = Number(process.env.PORT) || 4000
const host = '127.0.0.1'
const app = await buildApp()

try {
  await prisma.$queryRaw`SELECT 1`
} catch (error) {
  console.error('Database is not reachable. Run `npm run db` and `npm run db:setup` first.')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

await app.listen({ port, host })
console.log(`Carevia API listening on http://${host}:${port}`)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close()
    process.exit(0)
  })
}

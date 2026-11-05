import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // En producción (Render) no logueamos cada query: llena los logs del plan
  // gratuito muy rápido. En dev sí, es útil para depurar.
  const isProd = process.env.NODE_ENV === 'production'
  return new PrismaClient({
    log: isProd ? ['error', 'warn'] : ['query', 'error', 'warn'],
  })
}

/**
 * The dev server caches the PrismaClient singleton on globalThis. If
 * `prisma generate` / `db:push` runs while the dev server is already up
 * (e.g. a new model was added to the schema), that cached instance
 * predates the regenerated client and misses the new model delegates,
 * causing `db.<newModel>` to be undefined. Detect that staleness and
 * transparently rebuild the singleton.
 */
function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma
  if (cached) {
    const stale =
      typeof (cached as unknown as Record<string, unknown>).lead === 'undefined' ||
      typeof (cached as unknown as Record<string, unknown>).restaurant === 'undefined' ||
      typeof (cached as unknown as Record<string, unknown>).driver === 'undefined' ||
      typeof (cached as unknown as Record<string, unknown>).admin === 'undefined'
    if (stale) {
      globalForPrisma.prisma = createPrismaClient()
    }
    return globalForPrisma.prisma as PrismaClient
  }
  globalForPrisma.prisma = createPrismaClient()
  return globalForPrisma.prisma
}

export const db = getPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * One-off seed for the multi-driver migration.
 *
 * 1. Ensures a Driver record exists for the legacy shared account
 *    ("repartidor" / DRIVER_PASSWORD from .env, default "reparto123") so the
 *    existing credentials keep working after the migration.
 * 2. Assigns every restaurant that has no driver yet to that account, so the
 *    current setup (one driver, all restaurants) is preserved. The owner can
 *    then re-split restaurants between drivers from the console.
 *
 * Run with: bun scripts/seed-driver.ts
 */
import { PrismaClient } from '@prisma/client'
import { scryptSync, randomBytes } from 'crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  const username = 'repartidor'
  const password = process.env.DRIVER_PASSWORD || 'reparto123'

  let driver = await db.driver.findUnique({ where: { username } })

  if (!driver) {
    driver = await db.driver.create({
      data: { username, password: hashPassword(password), name: 'Repartidor' },
    })
    console.log(`[seed] created driver "${username}" (password from DRIVER_PASSWORD)`)
  } else {
    // Keep the stored password in sync with the env value on re-runs.
    await db.driver.update({
      where: { id: driver.id },
      data: { password: hashPassword(password) },
    })
    console.log(`[seed] driver "${username}" already exists (password refreshed)`)
  }

  const res = await db.restaurant.updateMany({
    where: { assignedDriverId: null },
    data: { assignedDriverId: driver.id },
  })
  console.log(`[seed] assigned ${res.count} restaurant(s) without driver to "${username}"`)

  const total = await db.restaurant.count()
  console.log(`[seed] done. restaurants total: ${total}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())

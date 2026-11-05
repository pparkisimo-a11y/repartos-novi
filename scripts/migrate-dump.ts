/**
 * FASE 1 de la migración SQLite → Supabase Postgres.
 * Vuelca todas las tablas a JSON (se ejecuta con el cliente Prisma de SQLite).
 * Uso: bun run scripts/migrate-dump.ts
 */
import { db } from '../src/lib/db'

async function main() {
  const [drivers, restaurants, leads, deliveries] = await Promise.all([
    db.driver.findMany(),
    db.restaurant.findMany(),
    db.lead.findMany(),
    db.delivery.findMany(),
  ])

  const dump = {
    exportedAt: new Date().toISOString(),
    drivers,
    restaurants,
    leads,
    deliveries,
  }

  const { writeFileSync } = await import('fs')
  writeFileSync('/tmp/migration-data.json', JSON.stringify(dump, null, 2))

  console.log(`Dump completado:`)
  console.log(`  - Drivers:       ${drivers.length}`)
  console.log(`  - Restaurants:   ${restaurants.length}`)
  console.log(`  - Leads:         ${leads.length}`)
  console.log(`  - Deliveries:    ${deliveries.length}`)
  drivers.forEach((d) => console.log(`    · driver "${d.username}" (${d.name})`))
  restaurants.forEach((r) =>
    console.log(`    · restaurant "${r.username}" (${r.name}) → driverId: ${r.assignedDriverId ?? 'sin asignar'}`),
  )
}

main()
  .catch((err) => {
    console.error('Dump falló:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })

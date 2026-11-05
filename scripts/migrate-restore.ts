/**
 * FASE 2 de la migración SQLite → Supabase Postgres.
 * Restaura el JSON del dump en la base Postgres (conservando los IDs para
 * mantener las relaciones driver↔restaurant↔delivery).
 *
 * Requisitos: schema.prisma ya migrado a postgresql y `prisma db push` ejecutado.
 * Uso: bun run scripts/migrate-restore.ts
 */
import { db } from '../src/lib/db'

interface DumpDriver {
  id: string; username: string; password: string; name: string; createdAt: string
}
interface DumpRestaurant {
  id: string; name: string; username: string; password: string; address: string
  lat: number; lng: number; createdAt: string; assignedDriverId: string | null
}
interface DumpLead {
  id: string; restaurantName: string; contactName: string | null; phone: string | null
  message: string | null; status: string; notes: string | null; createdAt: string
  contactedAt: string | null; convertedAt: string | null; convertedRestaurantId: string | null
}
interface DumpDelivery {
  id: string; restaurantId: string; status: string; requestedAt: string
  acceptedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null
  rejectedAt: string | null; createdAt: string
}

async function main() {
  const { readFileSync, existsSync } = await import('fs')
  if (!existsSync('/tmp/migration-data.json')) {
    throw new Error('No existe /tmp/migration-data.json — ejecuta primero scripts/migrate-dump.ts')
  }
  const dump = JSON.parse(readFileSync('/tmp/migration-data.json', 'utf8')) as {
    drivers: DumpDriver[]; restaurants: DumpRestaurant[]; leads: DumpLead[]; deliveries: DumpDelivery[]
  }

  // Idempotencia: no duplicar si ya se restauró
  const existingDrivers = await db.driver.count()
  if (existingDrivers > 0) {
    console.log(`La BD ya tiene ${existingDrivers} drivers — se omite la restauración (ya migrada).`)
    return
  }

  const d = (iso: string | null | undefined) => (iso ? new Date(iso) : null)

  // 1. Drivers (primero: los restaurantes los referencian)
  await db.driver.createMany({
    data: dump.drivers.map((x) => ({
      id: x.id, username: x.username, password: x.password, name: x.name,
      createdAt: d(x.createdAt) ?? new Date(),
    })),
  })
  console.log(`✓ ${dump.drivers.length} drivers`)

  // 2. Restaurants (con su asignación de repartidor)
  await db.restaurant.createMany({
    data: dump.restaurants.map((x) => ({
      id: x.id, name: x.name, username: x.username, password: x.password,
      address: x.address, lat: x.lat, lng: x.lng,
      createdAt: d(x.createdAt) ?? new Date(),
      assignedDriverId: x.assignedDriverId,
    })),
  })
  console.log(`✓ ${dump.restaurants.length} restaurantes`)

  // 3. Leads
  if (dump.leads.length > 0) {
    await db.lead.createMany({
      data: dump.leads.map((x) => ({
        id: x.id, restaurantName: x.restaurantName, contactName: x.contactName,
        phone: x.phone, message: x.message, status: x.status, notes: x.notes,
        createdAt: d(x.createdAt) ?? new Date(), contactedAt: d(x.contactedAt),
        convertedAt: d(x.convertedAt), convertedRestaurantId: x.convertedRestaurantId,
      })),
    })
    console.log(`✓ ${dump.leads.length} leads`)
  }

  // 4. Deliveries (historial de repartos)
  if (dump.deliveries.length > 0) {
    await db.delivery.createMany({
      data: dump.deliveries.map((x) => ({
        id: x.id, restaurantId: x.restaurantId, status: x.status,
        requestedAt: d(x.requestedAt) ?? new Date(), acceptedAt: d(x.acceptedAt),
        pickedUpAt: d(x.pickedUpAt), deliveredAt: d(x.deliveredAt),
        rejectedAt: d(x.rejectedAt), createdAt: d(x.createdAt) ?? new Date(),
      })),
    })
    console.log(`✓ ${dump.deliveries.length} repartos`)
  }

  console.log('Restauración completada.')
}

main()
  .catch((err) => {
    console.error('Restauración falló:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })

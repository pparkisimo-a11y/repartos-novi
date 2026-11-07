/**
 * Seed de la base de datos LOCAL de desarrollo (sandbox).
 *
 * Uso:
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/novi" \
 *     bun run scripts/seed-dev.ts
 *
 * Crea: 1 admin, 2 repartidores y 2 restaurantes — ambos restaurantes
 * asignados a AMBOS repartidores (para probar el flujo multi-repartidor).
 * Idempotente: si ya existen, no duplica.
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'

async function main() {
  // --- Admin ---
  const admin = await db.admin.findUnique({ where: { username: 'admin' } })
  if (!admin) {
    await db.admin.create({
      data: {
        username: 'admin',
        password: hashPassword('admin1234'),
        name: 'Administrador NOVI',
      },
    })
    console.log('✓ admin / admin1234')
  } else {
    console.log('· admin ya existe')
  }

  // --- Repartidores ---
  const drivers = [
    { username: 'atar', password: 'atar1234', name: 'Mohamed' },
    { username: 'laura', password: 'laura1234', name: 'Laura' },
  ]
  const driverIds: string[] = []
  for (const d of drivers) {
    const existing = await db.driver.findUnique({ where: { username: d.username } })
    if (existing) {
      console.log(`· repartidor ${d.username} ya existe`)
      driverIds.push(existing.id)
    } else {
      const created = await db.driver.create({
        data: { username: d.username, password: hashPassword(d.password), name: d.name },
      })
      console.log(`✓ repartidor ${d.username} / ${d.password}`)
      driverIds.push(created.id)
    }
  }

  // --- Restaurantes (asignados a TODOS los repartidores) ---
  const restaurants = [
    {
      name: 'Kebab Istanbul',
      username: 'istanbul',
      password: '1234',
      address: 'Calle Mayor 1, Madrid',
      lat: 40.4168,
      lng: -3.7038,
    },
    {
      name: 'Pizzeria Centro',
      username: 'pizzacentro',
      password: 'pizza1234',
      address: 'Plaza del Sol 3, Madrid',
      lat: 40.4175,
      lng: -3.7034,
    },
  ]
  for (const r of restaurants) {
    const existing = await db.restaurant.findUnique({ where: { username: r.username } })
    let restaurantId = existing?.id
    if (!existing) {
      const { password, ...rest } = r
      const created = await db.restaurant.create({
        data: { ...rest, password: hashPassword(password) },
      })
      console.log(`✓ restaurante ${r.username} / ${r.password}`)
      restaurantId = created.id
    } else {
      console.log(`· restaurante ${r.username} ya existe`)
    }

    // Asignar a todos los repartidores (multi-asignación)
    for (const driverId of driverIds) {
      await db.restaurantDriver.upsert({
        where: { restaurantId_driverId: { restaurantId: restaurantId!, driverId } },
        create: { restaurantId: restaurantId!, driverId },
        update: {},
      })
    }
  }
  console.log(`✓ ambos restaurantes asignados a ${driverIds.length} repartidores`)

  await db.$disconnect()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })

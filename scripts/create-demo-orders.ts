/* Escenario de prueba para las tarjetas plegables (solo sandbox).
 *
 * Limpia los repartos activos de prueba y crea para Pizzeria Centro:
 *   - 2 PENDING   (esperando repartidor: van GRANDES)
 *   - 1 ACCEPTED  (Mohamed lo llevó: se pliega solo)
 *   - 1 PICKED_UP (en entrega con dirección/tarifa: se pliega solo)
 */
import { db } from '../src/lib/db'

const mins = (n: number) => new Date(Date.now() - n * 60_000)

async function main() {
  const r = await db.restaurant.findUnique({ where: { username: 'pizzacentro' } })
  const atar = await db.driver.findUnique({ where: { username: 'atar' } })
  if (!r) throw new Error('No existe pizzacentro — ejecuta seed-dev.ts primero')
  if (!atar) throw new Error('No existe atar — ejecuta seed-dev.ts primero')

  // Limpieza: fuera los repartos activos de pruebas anteriores
  const removed = await db.delivery.deleteMany({
    where: { status: { in: ['PENDING', 'ACCEPTED', 'PICKED_UP'] } },
  })
  console.log(`✓ limpiados ${removed.count} repartos activos anteriores`)

  const p1 = await db.delivery.create({
    data: {
      restaurantId: r.id, status: 'PENDING', customerName: 'Ana',
      requestedAt: mins(3),
    },
  })
  const p2 = await db.delivery.create({
    data: {
      restaurantId: r.id, status: 'PENDING', customerName: 'Pedro',
      requestedAt: mins(8),
    },
  })
  const acc = await db.delivery.create({
    data: {
      restaurantId: r.id, status: 'ACCEPTED', customerName: 'Claudia',
      driverId: atar.id, requestedAt: mins(16), acceptedAt: mins(12),
    },
  })
  const picked = await db.delivery.create({
    data: {
      restaurantId: r.id, status: 'PICKED_UP', customerName: 'Juan',
      driverId: atar.id, requestedAt: mins(28), acceptedAt: mins(24),
      pickedUpAt: mins(6),
      dropoffAddress: 'Calle Trevenque 17, 18320 Santa Fe',
      dropoffLat: 37.16542, dropoffLng: -3.58314,
      distanceKm: 1.94, fee: 3.0,
    },
  })

  console.log('✓ PENDING  Ana    :', p1.id)
  console.log('✓ PENDING  Pedro  :', p2.id)
  console.log('✓ ACCEPTED Claudia:', acc.id)
  console.log('✓ PICKED_UP Juan  :', picked.id)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

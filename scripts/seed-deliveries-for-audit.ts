/**
 * Crea repartos ENTREGADOS (DELIVERED) en el mes actual para que la
 * Liquidación del panel de admin muestre datos realistas:
 *   - 2 restaurantes × 2 repartidores
 *   - fees variados (distintas distancias → distintas tarifas)
 *   - repartidos a lo largo del mes actual
 *
 * Idempotente: si ya existen ≥4 repartos DELIVERED este mes, no hace nada.
 */
import { db } from '../src/lib/db'

async function main() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)

  const deliveredThisMonth = await db.delivery.count({
    where: { status: 'DELIVERED', deliveredAt: { gte: startOfMonth } },
  })
  if (deliveredThisMonth >= 4) {
    console.log(`· ya hay ${deliveredThisMonth} repartos entregados este mes — no creo más`)
    await db.$disconnect()
    return
  }

  const istanbul = await db.restaurant.findUnique({ where: { username: 'istanbul' } })
  const pizzacentro = await db.restaurant.findUnique({ where: { username: 'pizzacentro' } })
  const atar = await db.driver.findUnique({ where: { username: 'atar' } })
  const laura = await db.driver.findUnique({ where: { username: 'laura' } })
  if (!istanbul || !pizzacentro || !atar || !laura) {
    throw new Error('Faltan datos seed — ejecuta scripts/seed-dev.ts primero')
  }

  // día del mes (repartidos en días distintos a lo largo del mes)
  const day = (n: number) => {
    const d = new Date(today)
    d.setDate(Math.min(n, now.getDate()))
    return d
  }

  // Direcciones de entrega realistas en Granada + distancia/tarifa calculada
  // (fee = 3€ hasta 2km + 0.35€ por km empezado extra)
  const sample = [
    {
      restaurant: istanbul,
      driver: atar,
      dropoffAddress: 'Calle Recogidas 40, Granada',
      dropoffLat: 37.171432, dropoffLng: -3.6036962,
      distanceKm: 1.8, fee: 3.0,
      deliveredAt: day(2),
    },
    {
      restaurant: istanbul,
      driver: atar,
      dropoffAddress: 'Calle Gran Vía 1, Granada',
      dropoffLat: 37.1765, dropoffLng: -3.5989,
      distanceKm: 0.6, fee: 3.0,
      deliveredAt: day(5),
    },
    {
      restaurant: istanbul,
      driver: laura,
      dropoffAddress: 'Plaza Nueva, Granada',
      dropoffLat: 37.1763, dropoffLng: -3.5886,
      distanceKm: 2.4, fee: 3.35,
      deliveredAt: day(8),
    },
    {
      restaurant: pizzacentro,
      driver: atar,
      dropoffAddress: 'Calle Reyes Católicos 18, Granada',
      dropoffLat: 37.1744, dropoffLng: -3.5908,
      distanceKm: 1.9, fee: 3.0,
      deliveredAt: day(10),
    },
    {
      restaurant: pizzacentro,
      driver: laura,
      dropoffAddress: 'Calle Pedro Antonio 12, Granada',
      dropoffLat: 37.1753, dropoffLng: -3.6042,
      distanceKm: 0.4, fee: 3.0,
      deliveredAt: day(12),
    },
    {
      restaurant: pizzacentro,
      driver: laura,
      dropoffAddress: 'Calle Ángel Ganivet 5, Granada',
      dropoffLat: 37.1729, dropoffLng: -3.6018,
      distanceKm: 3.2, fee: 3.7,
      deliveredAt: day(15),
    },
  ]

  for (const s of sample) {
    await db.delivery.create({
      data: {
        restaurantId: s.restaurant.id,
        driverId: s.driver.id,
        status: 'DELIVERED',
        customerName: `Cliente ${sample.indexOf(s) + 1}`,
        dropoffAddress: s.dropoffAddress,
        dropoffLat: s.dropoffLat,
        dropoffLng: s.dropoffLng,
        distanceKm: s.distanceKm,
        fee: s.fee,
        requestedAt: new Date(s.deliveredAt.getTime() - 30 * 60 * 1000),
        acceptedAt: new Date(s.deliveredAt.getTime() - 25 * 60 * 1000),
        pickedUpAt: new Date(s.deliveredAt.getTime() - 15 * 60 * 1000),
        deliveredAt: s.deliveredAt,
      },
    })
  }
  console.log(`✓ ${sample.length} repartos DELIVERED creados este mes`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * Crea repartos ENTREGADOS dentro de la ventana de un turno real:
 *   jueves 5 nov 2026, 19:00 → viernes 6 nov 2026, 13:00 (hora española)
 * Sirve para probar el selector de "Periodo personalizado" de la Liquidación
 * (pago por turnos) y su PDF.
 *
 * Incluye:
 *   - Un reparto a las 00:30 de la noche del jueves al viernes (valida la
 *     agrupación por día en hora española, no UTC).
 *   - Un reparto a las 13:45 del viernes, FUERA del turno (valida que el
 *     periodo lo excluye).
 *
 * Idempotente: si ya hay repartos en esa ventana, no hace nada.
 */
import { db } from '../src/lib/db'

// Ventana del turno en UTC (Madrid = UTC+1 en noviembre)
const SHIFT_FROM = new Date('2026-11-05T18:00:00.000Z') // jue 19:00 Madrid
const SHIFT_TO = new Date('2026-11-06T12:00:00.000Z') // vie 13:00 Madrid

async function main() {
  const inWindow = await db.delivery.count({
    where: { status: 'DELIVERED', deliveredAt: { gte: SHIFT_FROM, lt: SHIFT_TO } },
  })
  if (inWindow > 0) {
    console.log(`· ya hay ${inWindow} repartos en la ventana del turno — no creo más`)
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

  // (hora de entrega en UTC; fee = 3€ hasta 2km + 0.35€/km empezado extra)
  const sample = [
    // — Laura, turno del jueves por la noche —
    {
      restaurant: istanbul, driver: laura,
      dropoffAddress: 'Calle Molinos 34, Granada',
      dropoffLat: 37.1701, dropoffLng: -3.5939,
      distanceKm: 2.1, fee: 3.35,
      deliveredAt: new Date('2026-11-05T19:30:00.000Z'), // jue 20:30
    },
    {
      restaurant: pizzacentro, driver: laura,
      dropoffAddress: 'Calle Santa Paula 8, Granada',
      dropoffLat: 37.1789, dropoffLng: -3.5966,
      distanceKm: 1.2, fee: 3.0,
      deliveredAt: new Date('2026-11-05T21:15:00.000Z'), // jue 22:15
    },
    {
      restaurant: istanbul, driver: laura,
      dropoffAddress: 'Calle Elvira 21, Granada',
      dropoffLat: 37.1758, dropoffLng: -3.5953,
      distanceKm: 0.9, fee: 3.0,
      deliveredAt: new Date('2026-11-05T23:30:00.000Z'), // vie 00:30 (madrugada)
    },
    // — Laura, viernes por la mañana (dentro del turno) —
    {
      restaurant: pizzacentro, driver: laura,
      dropoffAddress: 'Camino de Ronda 102, Granada',
      dropoffLat: 37.1605, dropoffLng: -3.6077,
      distanceKm: 2.8, fee: 3.35,
      deliveredAt: new Date('2026-11-06T11:40:00.000Z'), // vie 12:40
    },
    // — Mohamed, mismo turno —
    {
      restaurant: pizzacentro, driver: atar,
      dropoffAddress: 'Calle San Juan de Dios 3, Granada',
      dropoffLat: 37.1736, dropoffLng: -3.5925,
      distanceKm: 3.4, fee: 3.7,
      deliveredAt: new Date('2026-11-05T20:30:00.000Z'), // jue 21:30
    },
    {
      restaurant: istanbul, driver: atar,
      dropoffAddress: 'Paseo de los Basilios 2, Granada',
      dropoffLat: 37.1695, dropoffLng: -3.5966,
      distanceKm: 1.5, fee: 3.0,
      deliveredAt: new Date('2026-11-06T10:20:00.000Z'), // vie 11:20
    },
    // — Fuera del turno (viernes 13:45): NO debe contar en el periodo —
    {
      restaurant: pizzacentro, driver: laura,
      dropoffAddress: 'Calle Joaquina Eguaras 5, Granada',
      dropoffLat: 37.1644, dropoffLng: -3.6096,
      distanceKm: 1.1, fee: 3.0,
      deliveredAt: new Date('2026-11-06T12:45:00.000Z'), // vie 13:45
    },
  ]

  for (const s of sample) {
    await db.delivery.create({
      data: {
        restaurantId: s.restaurant.id,
        driverId: s.driver.id,
        status: 'DELIVERED',
        customerName: `Cliente turno ${sample.indexOf(s) + 1}`,
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
  console.log(`✓ ${sample.length} repartos creados (6 dentro del turno jue-vie + 1 fuera)`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

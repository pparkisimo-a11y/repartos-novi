/**
 * Limpieza de datos de PRUEBA en producción.
 *
 * Uso:
 *   DATABASE_URL="<url-de-producción>" bun run scripts/cleanup-test-data.ts
 *
 * Qué hace:
 *   1. Muestra el estado actual de todas las tablas (para dejar constancia).
 *   2. Borra las solicitudes (leads) de prueba creadas antes del 2026-11-06
 *      (las 3 de prueba: "Nuevo Restaurante", "Pizzeria QR Test",
 *      "Kebab Captado QR"). Si hubiera leads posteriores (posiblemente reales)
 *      NO se tocan y se muestran al final.
 *   3. Borra las suscripciones push huérfanas: las de restaurantes o
 *      repartidores que ya no existen en la BD.
 *
 * Qué NO toca:
 *   - Admins, repartidores, restaurantes y pedidos (deliveries).
 */
import { db } from '../src/lib/db'

// Todas las solicitudes de prueba se crearon el 2026-11-05 (durante los tests).
// Cortamos a medianoche UTC de ese día → cualquier lead posterior se conserva.
const TEST_CUTOFF = new Date('2026-11-06T00:00:00Z')

async function main() {
  // ---------- 1. Estado inicial ----------
  const [admins, drivers, restaurants, deliveries, leads, subs] = await Promise.all([
    db.admin.findMany({ select: { username: true, name: true } }),
    db.driver.findMany({ select: { id: true, username: true, name: true } }),
    db.restaurant.findMany({ select: { id: true, username: true, name: true } }),
    db.delivery.count(),
    db.lead.findMany({ orderBy: { createdAt: 'asc' } }),
    db.pushSubscription.findMany(),
  ])

  console.log('════════ ESTADO ANTES DE LA LIMPIEZA ════════')
  console.log(`Admins:        ${admins.length} → ${admins.map((a) => a.username).join(', ')}`)
  console.log(
    `Repartidores:  ${drivers.length} → ${drivers.map((d) => `${d.username} (${d.name})`).join(', ')}`,
  )
  console.log(
    `Restaurantes:  ${restaurants.length}${restaurants.length ? ` → ${restaurants.map((r) => r.username).join(', ')}` : ''}`,
  )
  console.log(`Pedidos:       ${deliveries}`)
  console.log(`Solicitudes:   ${leads.length}`)
  for (const l of leads) {
    console.log(
      `  · [${l.status}] ${l.restaurantName} — ${l.phone} (${l.createdAt.toISOString()})`,
    )
  }
  console.log(`Suscrip. push: ${subs.length}`)
  for (const s of subs) {
    console.log(`  · ${s.role}:${s.userId} (desde ${s.createdAt.toISOString()})`)
  }

  // ---------- 2. Borrar leads de prueba ----------
  const testLeads = leads.filter((l) => l.createdAt < TEST_CUTOFF)
  const keepLeads = leads.filter((l) => l.createdAt >= TEST_CUTOFF)
  let deletedLeads = 0
  if (testLeads.length) {
    const res = await db.lead.deleteMany({ where: { id: { in: testLeads.map((l) => l.id) } } })
    deletedLeads = res.count
  }

  // ---------- 3. Borrar suscripciones push huérfanas ----------
  const driverIds = new Set(drivers.map((d) => d.id))
  const restaurantIds = new Set(restaurants.map((r) => r.id))
  const orphanSubs = subs.filter(
    (s) =>
      (s.role === 'driver' && !driverIds.has(s.userId)) ||
      (s.role === 'restaurant' && !restaurantIds.has(s.userId)),
  )
  let deletedSubs = 0
  if (orphanSubs.length) {
    const res = await db.pushSubscription.deleteMany({
      where: { id: { in: orphanSubs.map((s) => s.id) } },
    })
    deletedSubs = res.count
  }

  // ---------- 4. Resumen ----------
  console.log('\n════════ LIMPIEZA REALIZADA ════════')
  console.log(`✓ Solicitudes de prueba eliminadas: ${deletedLeads}`)
  console.log(`✓ Suscripciones push huérfanas:     ${deletedSubs}`)

  console.log('\n════════ ESTADO FINAL ════════')
  const [finalLeads, finalSubs] = await Promise.all([
    db.lead.findMany({ orderBy: { createdAt: 'asc' } }),
    db.pushSubscription.count(),
  ])
  console.log(`Solicitudes:   ${finalLeads.length}${finalLeads.length ? ' (posteriores al corte):' : ''}`)
  for (const l of finalLeads) {
    console.log(`  · [${l.status}] ${l.restaurantName} — ${l.phone} (${l.createdAt.toISOString()})`)
  }
  console.log(`Suscrip. push: ${finalSubs}`)
  console.log(`Repartidores:  ${drivers.length} (intactos: ${drivers.map((d) => d.username).join(', ')})`)
  console.log(`Restaurantes:  ${restaurants.length} (intactos)`)
  console.log(`Pedidos:       ${deliveries} (intactos)`)
  console.log(`Admins:        ${admins.length} (intactos)`)

  if (keepLeads.length) {
    console.log(
      `\n⚠ Quedan ${keepLeads.length} solicitud(es) creadas después del ${TEST_CUTOFF.toISOString()} — revísalas arriba por si alguna también es de prueba.`,
    )
  }
}

main()
  .catch((err) => {
    console.error('La limpieza falló:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
